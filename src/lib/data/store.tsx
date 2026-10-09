"use client";

/**
 * Live client-side copy of the database.
 *
 * The whole dataset for a club is small, so every visitor loads it once and
 * then applies row changes pushed by Supabase Realtime. Ratings are derived
 * locally by replaying completed matches through the Elo engine, which keeps
 * every screen consistent without any server-side rating tables.
 */

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { DEFAULT_ELO_CONFIG, computeRatings, type EloConfig, type EloMatch, type RatingsResult } from "@/lib/elo";
import { supabase } from "@/lib/supabase";
import type { AppSettings, Match, Player, TableName, Tables } from "@/lib/types";

const TABLES: TableName[] = ["players", "matches", "tournaments", "tournament_entries", "sessions", "app_settings"];
const PAGE = 1000;

type Rows = { [K in TableName]: Map<string, Tables[K]> };

interface State {
  rows: Rows;
  status: "loading" | "ready" | "error";
  error: string | null;
}

type Action =
  | { type: "snapshot"; rows: Rows }
  | { type: "upsert"; table: TableName; row: Tables[TableName] }
  | { type: "delete"; table: TableName; id: string }
  | { type: "error"; message: string };

const emptyRows = (): Rows => ({
  players: new Map(),
  matches: new Map(),
  tournaments: new Map(),
  tournament_entries: new Map(),
  sessions: new Map(),
  app_settings: new Map(),
});

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "snapshot":
      return { rows: action.rows, status: "ready", error: null };
    case "upsert": {
      const table = new Map(state.rows[action.table] as Map<string, Tables[TableName]>);
      table.set(String((action.row as { id: string | number }).id), action.row);
      return { ...state, rows: { ...state.rows, [action.table]: table } };
    }
    case "delete": {
      const table = new Map(state.rows[action.table] as Map<string, Tables[TableName]>);
      table.delete(action.id);
      return { ...state, rows: { ...state.rows, [action.table]: table } };
    }
    case "error":
      return { ...state, status: state.status === "ready" ? "ready" : "error", error: action.message };
  }
}

async function fetchTable<T extends TableName>(table: T): Promise<Tables[T][]> {
  const all: Tables[T][] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data as Tables[T][]));
    if (data.length < PAGE) return all;
  }
}

async function fetchAll(): Promise<Rows> {
  const results = await Promise.all(TABLES.map((t) => fetchTable(t)));
  const rows = emptyRows();
  TABLES.forEach((t, i) => {
    const map = rows[t] as Map<string, Tables[TableName]>;
    for (const row of results[i]) map.set(String((row as { id: string | number }).id), row);
  });
  return rows;
}

export type Connection = "connecting" | "live" | "offline";

interface DataContextValue {
  status: State["status"];
  error: string | null;
  connection: Connection;
  players: Map<string, Player>;
  matches: Map<string, Match>;
  tournaments: Rows["tournaments"];
  entries: Rows["tournament_entries"];
  sessions: Rows["sessions"];
  settings: AppSettings | null;
  config: EloConfig;
  ratings: RatingsResult;
  /** Re-download everything (e.g. after a failed write). */
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

function toEloMatch(m: Match): EloMatch {
  return {
    id: m.id,
    mode: m.mode,
    playedAt: m.played_at ?? m.completed_at ?? m.created_at,
    teamA: m.team_a,
    teamB: m.team_b,
    games: m.games,
    pointsToWin: m.points_to_win,
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { rows: emptyRows(), status: "loading", error: null });
  const [connection, setConnection] = useState<Connection>("connecting");
  const loading = useRef(false);
  const loaded = useRef(false);
  const buffered = useRef<Action[]>([]);
  const lastHidden = useRef<number | null>(null);

  const load = useRef(async () => {
    if (loading.current) return;
    loading.current = true;
    buffered.current = [];
    try {
      const rows = await fetchAll();
      dispatch({ type: "snapshot", rows });
      loaded.current = true;
      // Apply changes that arrived while the snapshot was in flight.
      for (const action of buffered.current) dispatch(action);
    } catch (err) {
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      buffered.current = [];
      loading.current = false;
    }
  });

  useEffect(() => {
    const apply = (table: TableName, payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const action: Action =
        payload.eventType === "DELETE"
          ? { type: "delete", table, id: String((payload.old as { id: string | number }).id) }
          : { type: "upsert", table, row: payload.new as unknown as Tables[TableName] };
      if (loading.current) buffered.current.push(action);
      else dispatch(action);
    };

    // Unique name per mount: supabase-js reuses a channel with the same topic, and in
    // StrictMode the first mount's channel is still being torn down when the second subscribes.
    let channel = supabase.channel(`db-changes-${crypto.randomUUID()}`);
    for (const table of TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => apply(table, payload));
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnection("live");
        // (Re)subscribed: take a fresh snapshot so nothing missed while offline is lost.
        void load.current();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnection("offline");
      }
    });

    // If realtime can't connect at all, still show data.
    const fallback = setTimeout(() => {
      if (!loaded.current) void load.current();
    }, 4000);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        lastHidden.current = Date.now();
      } else if (lastHidden.current && Date.now() - lastHidden.current > 30_000) {
        void load.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimeout(fallback);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, []);

  const { players, matches } = state.rows;
  const settings = state.rows.app_settings.get("1") ?? null;

  const config = useMemo<EloConfig>(() => ({ ...DEFAULT_ELO_CONFIG, ...(settings?.elo ?? {}) }), [settings]);

  // Only completed, rated matches affect ratings; key on them so live scoring doesn't recompute.
  const ratedSignature = useMemo(() => {
    const parts: string[] = [];
    for (const m of matches.values()) {
      if (m.status === "completed" && m.is_rated) parts.push(`${m.id}:${m.updated_at}`);
    }
    return parts.sort().join(",");
  }, [matches]);

  const startingSignature = useMemo(
    () => [...players.values()].map((p) => `${p.id}:${p.initial_singles}:${p.initial_doubles}`).join(","),
    [players],
  );

  const ratings = useMemo(() => {
    const starting = [...players.values()].map((p) => ({ id: p.id, singles: p.initial_singles, doubles: p.initial_doubles }));
    const rated = [...matches.values()].filter((m) => m.status === "completed" && m.is_rated).map(toEloMatch);
    return computeRatings(starting, rated, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signatures capture the relevant changes
  }, [ratedSignature, startingSignature, config]);

  const value = useMemo<DataContextValue>(
    () => ({
      status: state.status,
      error: state.error,
      connection,
      players,
      matches,
      tournaments: state.rows.tournaments,
      entries: state.rows.tournament_entries,
      sessions: state.rows.sessions,
      settings,
      config,
      ratings,
      refresh: () => load.current(),
    }),
    [state, connection, players, matches, settings, config, ratings],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}

export { toEloMatch };
