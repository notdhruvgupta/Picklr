import type { Mode, RatingsResult } from "@/lib/elo";
import type { StatMatch } from "@/lib/stats";
import type { Match, Player } from "@/lib/types";

export function playerName(players: Map<string, Player>, id: string): string {
  return players.get(id)?.name ?? "Unknown";
}

export function teamLabel(players: Map<string, Player>, ids: string[]): string {
  if (ids.length === 0) return "TBD";
  return ids.map((id) => playerName(players, id)).join(" & ");
}

export const matchTime = (m: Match) => m.played_at ?? m.completed_at ?? m.started_at ?? m.created_at;

/** Completed matches, newest first. */
export function completedMatches(matches: Map<string, Match>, filter?: (m: Match) => boolean): Match[] {
  return [...matches.values()]
    .filter((m) => m.status === "completed" && (!filter || filter(m)))
    .sort((x, y) => (matchTime(y) < matchTime(x) ? -1 : matchTime(y) > matchTime(x) ? 1 : 0));
}

export function liveMatches(matches: Map<string, Match>): Match[] {
  return [...matches.values()]
    .filter((m) => m.status === "live")
    .sort((x, y) => (x.started_at ?? "").localeCompare(y.started_at ?? ""));
}

/** Scheduled matches that have both teams, in queue order. */
export function upcomingMatches(matches: Map<string, Match>, filter?: (m: Match) => boolean): Match[] {
  return [...matches.values()]
    .filter((m) => m.status === "scheduled" && m.team_a.length > 0 && m.team_b.length > 0 && (!filter || filter(m)))
    .sort((x, y) => (x.queue_position ?? 1e9) - (y.queue_position ?? 1e9) || x.created_at.localeCompare(y.created_at));
}

export function toStatMatch(m: Match): StatMatch | null {
  if (m.status !== "completed" || !m.winner) return null;
  return { id: m.id, mode: m.mode, playedAt: matchTime(m), teamA: m.team_a, teamB: m.team_b, winner: m.winner };
}

export function statMatches(matches: Map<string, Match>): StatMatch[] {
  return completedMatches(matches)
    .map(toStatMatch)
    .filter((m): m is StatMatch => m !== null);
}

/** Current rating with a fallback to the starting rating for players without stats yet. */
export function currentRating(ratings: RatingsResult, player: Player, mode: Mode): number {
  return ratings.players.get(player.id)?.[mode].rating ?? (mode === "singles" ? player.initial_singles : player.initial_doubles);
}

export function playersByRating(players: Map<string, Player>, ratings: RatingsResult, mode: Mode, activeOnly = true): Player[] {
  return [...players.values()]
    .filter((p) => !activeOnly || p.is_active)
    .sort((x, y) => currentRating(ratings, y, mode) - currentRating(ratings, x, mode));
}
