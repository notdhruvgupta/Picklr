/** Derived statistics: partners, rivals, upsets, form. All pure. */

import type { Mode, RatingsResult, Team } from "@/lib/elo";

export interface StatMatch {
  id: string;
  mode: Mode;
  playedAt: string;
  teamA: string[];
  teamB: string[];
  winner: Team;
}

export interface PairRecord {
  playerId: string;
  played: number;
  wins: number;
}

function sideOf(m: StatMatch, playerId: string): Team | null {
  if (m.teamA.includes(playerId)) return "A";
  if (m.teamB.includes(playerId)) return "B";
  return null;
}

const byPlayedThenRate = (x: PairRecord, y: PairRecord) =>
  y.wins / y.played - x.wins / x.played || y.played - x.played;

/** Doubles partners of a player with the record they share. */
export function partnerStats(playerId: string, matches: StatMatch[]): PairRecord[] {
  const records = new Map<string, PairRecord>();
  for (const m of matches) {
    if (m.mode !== "doubles") continue;
    const side = sideOf(m, playerId);
    if (!side) continue;
    for (const partner of side === "A" ? m.teamA : m.teamB) {
      if (partner === playerId) continue;
      const r = records.get(partner) ?? { playerId: partner, played: 0, wins: 0 };
      r.played++;
      if (m.winner === side) r.wins++;
      records.set(partner, r);
    }
  }
  return [...records.values()].sort(byPlayedThenRate);
}

/** Every opponent a player has faced, with the player's wins against them. */
export function opponentStats(playerId: string, matches: StatMatch[], mode?: Mode): PairRecord[] {
  const records = new Map<string, PairRecord>();
  for (const m of matches) {
    if (mode && m.mode !== mode) continue;
    const side = sideOf(m, playerId);
    if (!side) continue;
    for (const opp of side === "A" ? m.teamB : m.teamA) {
      const r = records.get(opp) ?? { playerId: opp, played: 0, wins: 0 };
      r.played++;
      if (m.winner === side) r.wins++;
      records.set(opp, r);
    }
  }
  return [...records.values()].sort(byPlayedThenRate);
}

export interface HeadToHead {
  against: { played: number; wins: number; matchIds: string[] };
  together: { played: number; wins: number; matchIds: string[] };
}

/** Record of player `a` against and alongside player `b`. */
export function headToHead(a: string, b: string, matches: StatMatch[]): HeadToHead {
  const result: HeadToHead = {
    against: { played: 0, wins: 0, matchIds: [] },
    together: { played: 0, wins: 0, matchIds: [] },
  };
  for (const m of matches) {
    const sa = sideOf(m, a);
    const sb = sideOf(m, b);
    if (!sa || !sb) continue;
    const bucket = sa === sb ? result.together : result.against;
    bucket.played++;
    bucket.matchIds.push(m.id);
    if (m.winner === sa) bucket.wins++;
  }
  return result;
}

export interface Upset {
  matchId: string;
  /** Pre-match win probability of the side that won. */
  winnerExpected: number;
}

export function biggestUpsets(ratings: RatingsResult, limit = 5, mode?: Mode): Upset[] {
  const upsets: Upset[] = [];
  for (const info of ratings.byMatch.values()) {
    if (mode && info.mode !== mode) continue;
    const winnerExpected = info.winner === "A" ? info.expectedA : 1 - info.expectedA;
    if (winnerExpected < 0.5) upsets.push({ matchId: info.matchId, winnerExpected });
  }
  return upsets.sort((x, y) => x.winnerExpected - y.winnerExpected).slice(0, limit);
}

/** Rating change for a player since a point in time (0 if no matches since). */
export function ratingChangeSince(ratings: RatingsResult, playerId: string, mode: Mode, since: string): number {
  const stats = ratings.players.get(playerId)?.[mode];
  if (!stats) return 0;
  let before = stats.start;
  for (const point of stats.history) {
    if (point.playedAt === null) continue;
    if (point.playedAt >= since) break;
    before = point.rating;
  }
  return stats.rating - before;
}

export interface FormRow {
  playerId: string;
  change: number;
  matches: number;
}

/** Biggest rating movers since a point in time, among players who played since then. */
export function movers(ratings: RatingsResult, playerIds: string[], mode: Mode, since: string): FormRow[] {
  return playerIds
    .map((playerId) => {
      const history = ratings.players.get(playerId)?.[mode].history ?? [];
      const matches = history.filter((p) => p.playedAt !== null && p.playedAt >= since).length;
      return { playerId, change: ratingChangeSince(ratings, playerId, mode, since), matches };
    })
    .filter((r) => r.matches > 0)
    .sort((x, y) => y.change - x.change);
}

export interface SessionLine {
  playerId: string;
  wins: number;
  losses: number;
  /** Sum of rating changes across modes for these matches. */
  delta: number;
}

/** Per-player summary for a set of matches (e.g. one session), best first. */
export function summarize(matchIds: string[], ratings: RatingsResult): SessionLine[] {
  const lines = new Map<string, SessionLine>();
  for (const id of matchIds) {
    const info = ratings.byMatch.get(id);
    if (!info) continue;
    for (const c of info.changes) {
      const line = lines.get(c.playerId) ?? { playerId: c.playerId, wins: 0, losses: 0, delta: 0 };
      if (c.won) line.wins++;
      else line.losses++;
      line.delta += c.delta;
      lines.set(c.playerId, line);
    }
  }
  return [...lines.values()].sort((x, y) => y.delta - x.delta || y.wins - x.wins);
}
