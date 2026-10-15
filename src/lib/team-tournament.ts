/**
 * Team round robin ("Triple Team Tournament").
 *
 * Players are split into teams of 3 (some teams of 4 when the count isn't a
 * multiple of 3). Teams play a double or triple round robin of ordinary doubles
 * matches: each match, a team fields 2 of its players. Every player must play
 * a fair share of their team's matches (between `min` and `max`), and a lineup
 * is only allowed if the team's remaining matches can still be filled fairly.
 * The top two teams meet in a final with a mid-game substitution.
 */

import { roundRobin } from "@/lib/brackets";
import type { Team } from "@/lib/elo";
import type { RatedPlayer } from "@/lib/matchmaking";
import type { ScoringSystem } from "@/lib/scoring";
import type { MatchInsert, TournamentSpec } from "@/lib/tournament";

export const MIN_TEAM_PLAYERS = 6;
export const TEAM_CYCLES = [2, 3] as const;

/** Team sizes for `n` players: teams of 3, with the leftover 1 or 2 players making teams of 4. */
export function teamSizes(n: number): number[] {
  if (!Number.isInteger(n) || n < MIN_TEAM_PLAYERS) throw new Error(`A team tournament needs at least ${MIN_TEAM_PLAYERS} players`);
  const teams = Math.floor(n / 3);
  const fours = n % 3;
  return Array.from({ length: teams }, (_, i) => (i < fours ? 4 : 3));
}

/** Matches each team plays in the group stage. */
export const teamMatchCount = (teams: number, cycles: number) => (teams - 1) * cycles;

/** Fair share of a team's matches for each of its players: everyone plays `min` or `max`. */
export function playerCaps(rosterSize: number, teamMatches: number): { min: number; max: number } {
  const slots = 2 * teamMatches;
  return { min: Math.floor(slots / rosterSize), max: Math.ceil(slots / rosterSize) };
}

export type TeamFormation = "balanced" | "snake" | "random";

const average = (team: RatedPlayer[]) => team.reduce((s, p) => s + p.rating, 0) / team.length;

function spread(teams: RatedPlayer[][]): number {
  const avgs = teams.map(average);
  const mean = avgs.reduce((s, x) => s + x, 0) / avgs.length;
  return avgs.reduce((s, x) => s + (x - mean) ** 2, 0);
}

function snake(sorted: RatedPlayer[], sizes: number[]): RatedPlayer[][] {
  const teams: RatedPlayer[][] = sizes.map(() => []);
  let round = 0;
  let i = 0;
  while (i < sorted.length) {
    const order = round % 2 === 0 ? teams.map((_, t) => t) : teams.map((_, t) => teams.length - 1 - t);
    for (const t of order) {
      if (i >= sorted.length) break;
      if (teams[t].length < sizes[t]) teams[t].push(sorted[i++]);
    }
    round++;
  }
  return teams;
}

/**
 * Split players into teams. "balanced" starts from a snake draft and keeps
 * swapping players between teams while it makes team averages closer.
 * Teams come back strongest first, each sorted strongest first.
 */
export function formTeamsOfThree(players: RatedPlayer[], method: TeamFormation, random: () => number = Math.random): string[][] {
  const sizes = teamSizes(players.length);
  const sorted = [...players].sort((x, y) => y.rating - x.rating);
  let teams: RatedPlayer[][];

  if (method === "random") {
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    let at = 0;
    teams = sizes.map((size) => shuffled.slice(at, (at += size)));
  } else {
    teams = snake(sorted, sizes);
    if (method === "balanced") {
      let best = spread(teams);
      for (let improved = true; improved; ) {
        improved = false;
        for (let a = 0; a < teams.length; a++) {
          for (let b = a + 1; b < teams.length; b++) {
            for (let i = 0; i < teams[a].length; i++) {
              for (let j = 0; j < teams[b].length; j++) {
                [teams[a][i], teams[b][j]] = [teams[b][j], teams[a][i]];
                const score = spread(teams);
                if (score < best - 1e-9) {
                  best = score;
                  improved = true;
                } else {
                  [teams[a][i], teams[b][j]] = [teams[b][j], teams[a][i]];
                }
              }
            }
          }
        }
      }
    }
  }

  return teams
    .map((t) => [...t].sort((x, y) => y.rating - x.rating))
    .sort((x, y) => average(y) - average(x))
    .map((t) => t.map((p) => p.id));
}

/**
 * Can a team still give every player a fair share?
 *
 * `counts` are matches each player is already lined up for (played or
 * scheduled); `remaining` is how many of the team's matches still need a
 * lineup. Each remaining match takes 2 different players. Player i can take
 * between lo = max(0, min - count) and hi = min(max - count, remaining) more
 * matches, and a schedule exists exactly when lo ≤ hi for everyone and
 * Σlo ≤ 2·remaining ≤ Σhi (any counts ≤ remaining can be paired up).
 */
export function lineupFeasible(roster: string[], counts: Map<string, number>, remaining: number, caps: { min: number; max: number }): boolean {
  let sumLo = 0;
  let sumHi = 0;
  for (const id of roster) {
    const c = counts.get(id) ?? 0;
    if (c > caps.max) return false;
    const lo = Math.max(0, caps.min - c);
    const hi = Math.min(caps.max - c, remaining);
    if (lo > hi) return false;
    sumLo += lo;
    sumHi += hi;
  }
  return sumLo <= 2 * remaining && 2 * remaining <= sumHi;
}

/**
 * Pairs a team may field in a match, given the lineups already set for its
 * other group matches and how many of those still have no lineup.
 */
export function allowedPairs(
  roster: string[],
  countsElsewhere: Map<string, number>,
  othersWithoutLineup: number,
  caps: { min: number; max: number },
): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const counts = new Map(countsElsewhere);
      counts.set(roster[i], (counts.get(roster[i]) ?? 0) + 1);
      counts.set(roster[j], (counts.get(roster[j]) ?? 0) + 1);
      if (lineupFeasible(roster, counts, othersWithoutLineup, caps)) pairs.push([roster[i], roster[j]]);
    }
  }
  return pairs;
}

export interface TeamMatchView {
  id: string;
  entryA: string | null;
  entryB: string | null;
  teamA: string[];
  teamB: string[];
  void: boolean;
}

/** Lineup counts for one team across its group matches, optionally ignoring one match (the one being edited). */
export function teamUsage(entryId: string, matches: TeamMatchView[], exceptMatchId?: string) {
  const counts = new Map<string, number>();
  let withoutLineup = 0;
  for (const m of matches) {
    if (m.void || m.id === exceptMatchId) continue;
    const side: Team | null = m.entryA === entryId ? "A" : m.entryB === entryId ? "B" : null;
    if (!side) continue;
    const lineup = side === "A" ? m.teamA : m.teamB;
    if (lineup.length === 0) withoutLineup++;
    for (const id of lineup) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return { counts, withoutLineup };
}

/** Group-stage matches: every pair of teams meets `cycles` times; lineups are picked before each match. */
export function teamRoundRobinMatches(
  t: TournamentSpec,
  entries: { id: string; seed: number }[],
  newId: () => string,
): MatchInsert[] {
  const cycles = t.cycles ?? 2;
  const bySeed = new Map(entries.map((e) => [e.seed, e]));
  const perCycle = roundRobin(entries.length).length;
  const rows: MatchInsert[] = [];
  roundRobin(entries.length, cycles).forEach((round, r) => {
    for (const [sa, sb] of round) {
      rows.push({
        id: newId(),
        mode: "doubles",
        scoring: t.scoring,
        points_to_win: t.pointsToWin,
        win_by: t.winBy,
        best_of: t.bestOf,
        is_rated: t.isRated,
        tournament_id: t.id,
        queue_position: rows.length + 1,
        bracket_key: null,
        bracket_round: r + 1,
        bracket_label: `Leg ${Math.floor(r / perCycle) + 1} · Round ${(r % perCycle) + 1}`,
        stage: "group",
        entry_a_id: bySeed.get(sa)!.id,
        entry_b_id: bySeed.get(sb)!.id,
        team_a: [],
        team_b: [],
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

export interface FinalFormat {
  scoring: ScoringSystem;
  pointsToWin: number;
  winBy: number;
  subThreshold: number;
}

/** The final between the top two teams (first place is team A). Lineups are picked before it starts. */
export function teamFinalMatch(
  t: TournamentSpec,
  first: string,
  second: string,
  final: FinalFormat,
  id: string,
  queuePosition: number,
): MatchInsert & { sub_threshold: number } {
  return {
    id,
    mode: "doubles",
    scoring: final.scoring,
    points_to_win: final.pointsToWin,
    win_by: final.winBy,
    best_of: 1,
    is_rated: t.isRated,
    tournament_id: t.id,
    queue_position: queuePosition,
    bracket_key: "F",
    bracket_round: 1,
    bracket_label: "Final",
    stage: "playoff",
    entry_a_id: first,
    entry_b_id: second,
    team_a: [],
    team_b: [],
    winner_to: null,
    winner_to_slot: null,
    loser_to: null,
    loser_to_slot: null,
    is_conditional: false,
    sub_threshold: final.subThreshold,
  };
}

export function defaultTeamName(playerNames: string[]): string {
  return `Team ${playerNames[0] ?? "?"}`;
}
