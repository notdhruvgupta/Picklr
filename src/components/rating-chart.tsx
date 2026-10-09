"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Mode } from "@/lib/elo";
import { useData } from "@/lib/data/store";
import * as fmt from "@/lib/format";
import { Empty, cx } from "./ui";

const axisTick = { fill: "var(--muted)", fontSize: 11 };

interface TipProps {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
}

function niceDomain(values: number[]): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(10, (max - min) * 0.1);
  return [Math.floor((min - pad) / 25) * 25, Math.ceil((max + pad) / 25) * 25];
}

interface PlayerPoint {
  i: number;
  rating: number;
  date: string | null;
  delta: number | null;
  won: boolean | null;
  vs: string;
}

/** Recharts clones this element and injects `active` and `payload` on hover. */
function PlayerTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as unknown as PlayerPoint;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-card">
      <div className="tabular text-sm font-bold">{d.rating}</div>
      {d.date ? (
        <>
          <div className="text-muted">{fmt.date(d.date)}</div>
          <div>
            {d.won ? "Won" : "Lost"} vs {d.vs}{" "}
            {d.delta !== null && <span className={d.delta >= 0 ? "text-win" : "text-loss"}>{fmt.delta(d.delta)}</span>}
          </div>
        </>
      ) : (
        <div className="text-muted">Starting rating</div>
      )}
    </div>
  );
}

function RaceTip({ active, payload, ids, name, highlight }: TipProps & { ids: string[]; name: (id: string) => string; highlight: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const standings = ids.map((id) => ({ id, r: row[id] as number })).sort((a, b) => b.r - a.r);
  return (
    <div className="min-w-40 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-card">
      <div className="mb-1 text-muted">{row.i === 0 ? "Starting ratings" : `After match ${row.i}`}</div>
      <ol className="space-y-0.5">
        {standings.map((s, idx) => (
          <li key={s.id} className={cx("flex justify-between gap-4", s.id === highlight ? "font-bold" : "text-muted")}>
            <span>
              {idx + 1}. {name(s.id)}
            </span>
            <span className="tabular">{s.r}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One player's rating after each match in a mode. */
export function PlayerRatingChart({ playerId, mode }: { playerId: string; mode: Mode }) {
  const { ratings, matches, players } = useData();
  const history = ratings.players.get(playerId)?.[mode].history ?? [];

  const data: PlayerPoint[] = history.map((point, i) => {
    const info = point.matchId ? ratings.byMatch.get(point.matchId) : undefined;
    const change = info?.changes.find((c) => c.playerId === playerId);
    const match = point.matchId ? matches.get(point.matchId) : undefined;
    const opponents = match && change ? (change.team === "A" ? match.team_b : match.team_a) : [];
    return {
      i,
      rating: Math.round(point.rating),
      date: point.playedAt,
      delta: change?.delta ?? null,
      won: change?.won ?? null,
      vs: opponents.map((id) => players.get(id)?.name ?? "?").join(" & "),
    };
  });

  if (data.length < 2) {
    return <Empty title="No rating history yet">The chart fills in after their first {mode} match.</Empty>;
  }

  const last = data[data.length - 1];
  return (
    <div className="h-64 w-full" role="img" aria-label={`${mode} rating over ${data.length - 1} matches, now ${last.rating}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="i" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} allowDecimals={false} />
          <YAxis domain={niceDomain(data.map((d) => d.rating))} tick={axisTick} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<PlayerTip />} cursor={{ stroke: "var(--muted)", strokeWidth: 1 }} />
          <Line
            type="linear"
            dataKey="rating"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: "var(--chart-1)", stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <ReferenceDot x={last.i} y={last.rating} r={4} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
      <p className="sr-only">X axis: match number. Y axis: rating.</p>
    </div>
  );
}

/** Every active player's rating over the sequence of matches, one highlighted. */
export function RatingRace({ mode }: { mode: Mode }) {
  const { ratings, players } = useData();
  const active = useMemo(() => [...players.values()].filter((p) => p.is_active).sort((a, b) => a.name.localeCompare(b.name)), [players]);
  const leader = useMemo(() => {
    let best: string | null = null;
    for (const p of active) {
      const r = ratings.players.get(p.id)?.[mode].rating ?? -Infinity;
      if (!best || r > (ratings.players.get(best)?.[mode].rating ?? -Infinity)) best = p.id;
    }
    return best;
  }, [active, ratings, mode]);
  const [picked, setPicked] = useState<string | null>(null);
  const highlight = picked && active.some((p) => p.id === picked) ? picked : leader;

  const data = useMemo(() => {
    const current = new Map(active.map((p) => [p.id, ratings.players.get(p.id)?.[mode].start ?? 1500]));
    const rows: Record<string, number | string | null>[] = [{ i: 0, date: null, ...Object.fromEntries([...current].map(([k, v]) => [k, Math.round(v)])) }];
    let i = 0;
    for (const info of ratings.byMatch.values()) {
      if (info.mode !== mode) continue;
      const touched = info.changes.filter((c) => current.has(c.playerId));
      if (touched.length === 0) continue;
      for (const c of touched) current.set(c.playerId, c.after);
      i++;
      rows.push({ i, date: info.matchId, ...Object.fromEntries([...current].map(([k, v]) => [k, Math.round(v)])) });
    }
    return rows;
  }, [active, ratings, mode]);

  if (data.length < 2 || !highlight) {
    return <Empty title="Nothing to chart yet">The race starts after the first {mode} match.</Empty>;
  }

  const name = (id: string) => players.get(id)?.name ?? "?";
  const lastRow = data[data.length - 1];
  const allValues = data.flatMap((row) => active.map((p) => row[p.id] as number));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Highlight player">
        {active.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={p.id === highlight}
            onClick={() => setPicked(p.id)}
            className={cx(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
              p.id === highlight ? "border-chart-1 bg-surface text-text" : "border-line text-muted hover:text-text",
            )}
          >
            <span className={cx("h-0.5 w-3 rounded-full", p.id === highlight ? "bg-chart-1" : "bg-[var(--chart-context)]")} aria-hidden />
            {p.name}
          </button>
        ))}
      </div>
      <div className="h-72 w-full" role="img" aria-label={`${mode} ratings of all active players; ${name(highlight)} highlighted`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 64, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="i" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} allowDecimals={false} />
            <YAxis domain={niceDomain(allValues)} tick={axisTick} tickLine={false} axisLine={false} width={44} />
            <Tooltip content={<RaceTip ids={active.map((p) => p.id)} name={name} highlight={highlight} />} cursor={{ stroke: "var(--muted)", strokeWidth: 1 }} />
            {active
              .filter((p) => p.id !== highlight)
              .map((p) => (
                <Line key={p.id} type="linear" dataKey={p.id} stroke="var(--chart-context)" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
              ))}
            <Line
              type="linear"
              dataKey={highlight}
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: "var(--chart-1)", stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <ReferenceDot
              x={lastRow.i as number}
              y={lastRow[highlight] as number}
              r={4}
              fill="var(--chart-1)"
              stroke="var(--surface)"
              strokeWidth={2}
              label={{ value: name(highlight), position: "right", fill: "var(--text)", fontSize: 12, fontWeight: 600 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
