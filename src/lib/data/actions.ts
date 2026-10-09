"use client";

/**
 * Referee write operations. Each one goes straight to Supabase from the
 * browser; row-level security rejects them unless the user is a referee.
 * Every connected client (including this one) then receives the change
 * through Realtime, so nothing here updates local state by hand.
 */

import { matchWinner, type GameResult, type Mode, type Team } from "@/lib/elo";
import { initialState, type LiveState, type MatchFormat, type RallyEvent } from "@/lib/scoring";
import { check, supabase } from "@/lib/supabase";
import type { AppSettings, Match, PlaySession, Player } from "@/lib/types";

export interface NewMatch {
  mode: Mode;
  format: MatchFormat;
  teamA: string[];
  teamB: string[];
  isRated: boolean;
  firstServer?: Team;
  sessionId?: string | null;
  status?: "scheduled" | "live";
  queuePosition?: number | null;
}

export async function createMatch(input: NewMatch): Promise<Match> {
  const live = input.status === "live";
  const row = {
    mode: input.mode,
    scoring: input.format.scoring,
    points_to_win: input.format.pointsToWin,
    win_by: input.format.winBy,
    best_of: input.format.bestOf,
    is_rated: input.isRated,
    team_a: input.teamA,
    team_b: input.teamB,
    first_server: input.firstServer ?? "A",
    session_id: input.sessionId ?? null,
    queue_position: input.queuePosition ?? null,
    status: input.status ?? "scheduled",
    live_state: live ? initialState(input.format, input.firstServer ?? "A") : null,
    started_at: live ? new Date().toISOString() : null,
  };
  return check(await supabase.from("matches").insert(row).select().single()) as Match;
}

export async function startMatch(match: Match, firstServer: Team, format: MatchFormat): Promise<void> {
  check(
    await supabase
      .from("matches")
      .update({
        status: "live",
        first_server: firstServer,
        live_state: initialState(format, firstServer),
        rally_count: 0,
        started_at: new Date().toISOString(),
      })
      .eq("id", match.id)
      .eq("status", "scheduled"),
  );
}

export async function recordRally(matchId: string, seq: number, event: RallyEvent, state: LiveState): Promise<void> {
  check(await supabase.rpc("record_rally", { p_match_id: matchId, p_seq: seq, p_event: event, p_live_state: state }));
}

export async function undoRally(matchId: string, seq: number, state: LiveState): Promise<void> {
  check(await supabase.rpc("undo_rally", { p_match_id: matchId, p_seq: seq, p_live_state: state }));
}

export async function fetchRallies(matchId: string): Promise<RallyEvent[]> {
  const rows = check(await supabase.from("rally_events").select("seq, event").eq("match_id", matchId).order("seq"));
  return (rows as { seq: number; event: RallyEvent }[]).map((r) => r.event);
}

export async function completeMatch(matchId: string, games: GameResult[], playedAt?: string): Promise<void> {
  const winner = matchWinner(games);
  if (!winner) throw new Error("The result needs a winner.");
  check(
    await supabase.rpc("complete_match", {
      p_match_id: matchId,
      p_games: games,
      p_winner: winner,
      p_played_at: playedAt ?? null,
    }),
  );
}

/** Abandon a live match and put it back in the queue. */
export async function resetMatch(matchId: string): Promise<void> {
  check(await supabase.from("rally_events").delete().eq("match_id", matchId));
  check(
    await supabase
      .from("matches")
      .update({ status: "scheduled", live_state: null, rally_count: 0, started_at: null })
      .eq("id", matchId),
  );
}

export async function updateMatch(matchId: string, patch: Partial<Match>): Promise<void> {
  check(await supabase.from("matches").update(patch).eq("id", matchId));
}

export async function deleteMatch(matchId: string): Promise<void> {
  check(await supabase.from("matches").delete().eq("id", matchId));
}

export async function savePlayer(player: Partial<Player> & { name: string }): Promise<Player> {
  const row = {
    name: player.name.trim(),
    nickname: player.nickname?.trim() || null,
    initial_singles: player.initial_singles,
    initial_doubles: player.initial_doubles,
    is_active: player.is_active,
  };
  if (player.id) {
    return check(await supabase.from("players").update(row).eq("id", player.id).select().single()) as Player;
  }
  return check(await supabase.from("players").insert(row).select().single()) as Player;
}

export async function deletePlayer(id: string): Promise<void> {
  check(await supabase.from("players").delete().eq("id", id));
}

export async function saveSettings(patch: Partial<Pick<AppSettings, "group_name" | "elo">>): Promise<void> {
  check(await supabase.from("app_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1));
}

export async function openSession(mode: Mode, presentIds: string[]): Promise<PlaySession> {
  return check(
    await supabase.from("sessions").insert({ mode, present_player_ids: presentIds }).select().single(),
  ) as PlaySession;
}

export async function updateSession(id: string, patch: Partial<PlaySession>): Promise<void> {
  check(await supabase.from("sessions").update(patch).eq("id", id));
}

export type OwnedKind = "match" | "session" | "tournament";

/** Pass something you run (with everything in it) to another referee. */
export async function handOver(kind: OwnedKind, id: string, to: string): Promise<void> {
  check(await supabase.rpc("hand_over", { p_kind: kind, p_id: id, p_to: to }));
}

export async function renameReferee(userId: string, name: string): Promise<void> {
  check(await supabase.from("referees").update({ display_name: name.trim() }).eq("user_id", userId));
}

export function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  // Ownership errors from the database already name the referee ("Only Gaurav can change this match.").
  if (/^Only .+ can /.test(message) && !/Only the referee/.test(message)) return message;
  if (/row-level security|permission denied|Only the referee/i.test(message)) {
    return "You can't change this: it's run by another referee, or you're not signed in as a referee.";
  }
  if (/Failed to fetch|NetworkError/i.test(message)) return "Can't reach the server. Check your connection and try again.";
  return message;
}
