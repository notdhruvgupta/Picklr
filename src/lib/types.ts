import type { EloConfig, GameResult, Mode, Team } from "@/lib/elo";
import type { LiveState, ScoringSystem } from "@/lib/scoring";

export type MatchStatus = "scheduled" | "live" | "completed" | "void";

export interface Player {
  id: string;
  name: string;
  nickname: string | null;
  initial_singles: number;
  initial_doubles: number;
  is_active: boolean;
  created_at: string;
}

export interface Match {
  id: string;
  mode: Mode;
  scoring: ScoringSystem;
  points_to_win: number;
  win_by: number;
  best_of: number;
  status: MatchStatus;
  is_rated: boolean;
  team_a: string[];
  team_b: string[];
  games: GameResult[];
  winner: Team | null;
  first_server: Team;
  live_state: LiveState | null;
  rally_count: number;
  session_id: string | null;
  tournament_id: string | null;
  queue_position: number | null;
  bracket_key: string | null;
  bracket_round: number | null;
  bracket_label: string | null;
  stage: "group" | "playoff" | null;
  entry_a_id: string | null;
  entry_b_id: string | null;
  winner_to: string | null;
  winner_to_slot: Team | null;
  loser_to: string | null;
  loser_to_slot: Team | null;
  is_conditional: boolean;
  started_at: string | null;
  completed_at: string | null;
  played_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type TournamentFormat = "round_robin" | "single_elim" | "double_elim";
export type TeamFormationChoice = "fixed" | "balanced" | "snake" | "random";

export interface Tournament {
  id: string;
  name: string;
  format: TournamentFormat;
  mode: Mode;
  team_formation: TeamFormationChoice | null;
  scoring: ScoringSystem;
  points_to_win: number;
  win_by: number;
  best_of: number;
  playoff_size: number;
  /** Round robin only: times each pair meets (1 single, 2 double, 3 triple). */
  round_robin_cycles: number;
  is_rated: boolean;
  status: "active" | "completed" | "cancelled";
  winner_entry_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TournamentEntry {
  id: string;
  tournament_id: string;
  seed: number;
  name: string | null;
  player_ids: string[];
}

export interface PlaySession {
  id: string;
  played_on: string;
  status: "open" | "closed";
  mode: Mode;
  present_player_ids: string[];
  created_at: string;
  closed_at: string | null;
}

export interface AppSettings {
  id: number;
  group_name: string;
  elo: Partial<EloConfig>;
  updated_at: string;
}

export interface Tables {
  players: Player;
  matches: Match;
  tournaments: Tournament;
  tournament_entries: TournamentEntry;
  sessions: PlaySession;
  app_settings: AppSettings;
}

export type TableName = keyof Tables;
