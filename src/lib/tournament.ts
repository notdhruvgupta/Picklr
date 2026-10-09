/**
 * Turn a tournament format and seeded entries into match rows ready to insert.
 * Bracket matches reference each other by id (winner_to / loser_to), so ids are
 * generated here and the whole set is inserted in one statement.
 */

import { doubleElimination, roundRobin, singleElimination, type BracketMatch, type SlotSource } from "@/lib/brackets";
import type { Mode, Team } from "@/lib/elo";
import type { ScoringSystem } from "@/lib/scoring";
import type { TournamentFormat } from "@/lib/types";

export interface TournamentSpec {
  id: string;
  format: TournamentFormat;
  mode: Mode;
  scoring: ScoringSystem;
  pointsToWin: number;
  winBy: number;
  bestOf: number;
  isRated: boolean;
}

export interface EntrySpec {
  id: string;
  seed: number;
  playerIds: string[];
}

export interface MatchInsert {
  id: string;
  mode: Mode;
  scoring: ScoringSystem;
  points_to_win: number;
  win_by: number;
  best_of: number;
  is_rated: boolean;
  tournament_id: string;
  queue_position: number;
  bracket_key: string | null;
  bracket_round: number;
  bracket_label: string;
  stage: "group" | "playoff";
  entry_a_id: string | null;
  entry_b_id: string | null;
  team_a: string[];
  team_b: string[];
  winner_to: string | null;
  winner_to_slot: Team | null;
  loser_to: string | null;
  loser_to_slot: Team | null;
  is_conditional: boolean;
}

function base(t: TournamentSpec) {
  return {
    mode: t.mode,
    scoring: t.scoring,
    points_to_win: t.pointsToWin,
    win_by: t.winBy,
    best_of: t.bestOf,
    is_rated: t.isRated,
    tournament_id: t.id,
  };
}

/** Earliest "wave" a match can be played in, for a sensible one-court order. */
function depths(bracket: BracketMatch[]): Map<string, number> {
  const byKey = new Map(bracket.map((m) => [m.key, m]));
  const memo = new Map<string, number>();
  const depth = (key: string): number => {
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const m = byKey.get(key)!;
    const src = (s: SlotSource) => (s.type === "winner" || s.type === "loser" ? depth(s.key) : 0);
    const d = 1 + Math.max(src(m.a), src(m.b));
    memo.set(key, d);
    return d;
  };
  for (const m of bracket) depth(m.key);
  return memo;
}

export function eliminationMatches(
  t: TournamentSpec,
  entries: EntrySpec[],
  newId: () => string,
  options: { double?: boolean; stage?: "group" | "playoff"; queueStart?: number } = {},
): MatchInsert[] {
  const bracket = options.double ? doubleElimination(entries.length) : singleElimination(entries.length);
  const bySeed = new Map(entries.map((e) => [e.seed, e]));
  const ids = new Map(bracket.map((m) => [m.key, newId()]));
  const depth = depths(bracket);
  const bracketOrder = { W: 0, L: 1, GF: 2 };
  const ordered = [...bracket].sort(
    (x, y) => depth.get(x.key)! - depth.get(y.key)! || bracketOrder[x.bracket] - bracketOrder[y.bracket] || x.index - y.index,
  );

  return ordered.map((m, i) => {
    const slot = (s: SlotSource) => (s.type === "seed" ? bySeed.get(s.seed)! : null);
    const a = slot(m.a);
    const b = slot(m.b);
    return {
      ...base(t),
      id: ids.get(m.key)!,
      queue_position: (options.queueStart ?? 0) + i + 1,
      bracket_key: m.key,
      bracket_round: m.round,
      bracket_label: m.label,
      stage: options.stage ?? "group",
      entry_a_id: a?.id ?? null,
      entry_b_id: b?.id ?? null,
      team_a: a?.playerIds ?? [],
      team_b: b?.playerIds ?? [],
      winner_to: m.winnerTo ? ids.get(m.winnerTo.key)! : null,
      winner_to_slot: m.winnerTo?.slot ?? null,
      loser_to: m.loserTo ? ids.get(m.loserTo.key)! : null,
      loser_to_slot: m.loserTo?.slot ?? null,
      is_conditional: m.conditional,
    };
  });
}

export function roundRobinMatches(t: TournamentSpec, entries: EntrySpec[], newId: () => string): MatchInsert[] {
  const bySeed = new Map(entries.map((e) => [e.seed, e]));
  const rows: MatchInsert[] = [];
  roundRobin(entries.length).forEach((round, r) => {
    for (const [sa, sb] of round) {
      const a = bySeed.get(sa)!;
      const b = bySeed.get(sb)!;
      rows.push({
        ...base(t),
        id: newId(),
        queue_position: rows.length + 1,
        bracket_key: null,
        bracket_round: r + 1,
        bracket_label: `Round ${r + 1}`,
        stage: "group",
        entry_a_id: a.id,
        entry_b_id: b.id,
        team_a: a.playerIds,
        team_b: b.playerIds,
        winner_to: null,
        winner_to_slot: null,
        loser_to: null,
        loser_to_slot: null,
        is_conditional: false,
      });
    }
  });
  return rows;
}

export function buildTournamentMatches(t: TournamentSpec, entries: EntrySpec[], newId: () => string): MatchInsert[] {
  switch (t.format) {
    case "round_robin":
      return roundRobinMatches(t, entries, newId);
    case "single_elim":
      return eliminationMatches(t, entries, newId);
    case "double_elim":
      return eliminationMatches(t, entries, newId, { double: true });
  }
}

/** Knockout playoff for the top finishers of a round robin, re-seeded by finishing position. */
export function playoffMatches(
  t: TournamentSpec,
  finishers: EntrySpec[],
  size: number,
  newId: () => string,
  queueStart: number,
): MatchInsert[] {
  const top = finishers.slice(0, size).map((e, i) => ({ ...e, seed: i + 1 }));
  return eliminationMatches({ ...t }, top, newId, { stage: "playoff", queueStart }).map((m) => ({
    ...m,
    bracket_key: `P-${m.bracket_key}`,
  }));
}

export function formatName(format: TournamentFormat): string {
  return { round_robin: "Round robin", single_elim: "Single elimination", double_elim: "Double elimination" }[format];
}
