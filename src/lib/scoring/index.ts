/**
 * Pickleball scoring state machine.
 *
 * The live state of a match is a pure function of its format and the ordered
 * list of rally events, so "undo" is just replaying one event fewer.
 *
 * Side-out scoring: only the serving team scores. In doubles each team gets two
 * servers per side-out, except the very first service of a game ("0-0-2").
 * Rally scoring: every rally scores a point and the rally winner serves next.
 */

import type { GameResult, Mode, Team } from "@/lib/elo";

export type ScoringSystem = "sideout" | "rally";

export interface MatchFormat {
  mode: Mode;
  scoring: ScoringSystem;
  pointsToWin: number;
  winBy: number;
  /** 1, 3 or 5. */
  bestOf: number;
}

export const DEFAULT_FORMATS: Record<ScoringSystem, Omit<MatchFormat, "mode">> = {
  sideout: { scoring: "sideout", pointsToWin: 11, winBy: 2, bestOf: 1 },
  rally: { scoring: "rally", pointsToWin: 21, winBy: 2, bestOf: 1 },
};

export type RallyEvent =
  | { kind: "rally"; winner: Team }
  /** Referee correction: force the current game's score and serve. */
  | { kind: "correction"; a: number; b: number; servingTeam: Team; serverNumber: 1 | 2 };

export type Notice = "switch-ends" | "game-over" | "match-over" | null;

export interface LiveState {
  /** Completed games. */
  games: GameResult[];
  current: GameResult;
  servingTeam: Team;
  serverNumber: 1 | 2;
  /** Team that served first in the current game. */
  gameFirstServer: Team;
  winner: Team | null;
  rallies: number;
  /** Something the referee should be told about after the last event. */
  notice: Notice;
}

export const other = (t: Team): Team => (t === "A" ? "B" : "A");

export function gamesToWin(format: MatchFormat): number {
  return Math.floor(format.bestOf / 2) + 1;
}

export function isGameWon(score: GameResult, format: MatchFormat): Team | null {
  const { a, b } = score;
  if (a >= format.pointsToWin && a - b >= format.winBy) return "A";
  if (b >= format.pointsToWin && b - a >= format.winBy) return "B";
  return null;
}

function startingServerNumber(format: MatchFormat): 1 | 2 {
  return format.scoring === "sideout" && format.mode === "doubles" ? 2 : 1;
}

export function initialState(format: MatchFormat, firstServer: Team = "A"): LiveState {
  return {
    games: [],
    current: { a: 0, b: 0 },
    servingTeam: firstServer,
    serverNumber: startingServerNumber(format),
    gameFirstServer: firstServer,
    winner: null,
    rallies: 0,
    notice: null,
  };
}

export function gameWins(games: GameResult[]): Record<Team, number> {
  const wins = { A: 0, B: 0 };
  for (const g of games) {
    if (g.a > g.b) wins.A++;
    else if (g.b > g.a) wins.B++;
  }
  return wins;
}

/** True if the current game decides the match (or the match is a single game). */
export function isDecidingGame(state: LiveState, format: MatchFormat): boolean {
  const need = gamesToWin(format) - 1;
  const wins = gameWins(state.games);
  return wins.A === need && wins.B === need;
}

function addPoint(score: GameResult, team: Team): GameResult {
  return team === "A" ? { a: score.a + 1, b: score.b } : { a: score.a, b: score.b + 1 };
}

export function applyEvent(state: LiveState, event: RallyEvent, format: MatchFormat): LiveState {
  if (state.winner) return state;

  if (event.kind === "correction") {
    return finishGameIfWon(
      {
        ...state,
        current: { a: event.a, b: event.b },
        servingTeam: event.servingTeam,
        serverNumber: format.scoring === "sideout" && format.mode === "doubles" ? event.serverNumber : 1,
        rallies: state.rallies + 1,
        notice: null,
      },
      format,
    );
  }

  const next: LiveState = { ...state, rallies: state.rallies + 1, notice: null };
  const servingWon = event.winner === state.servingTeam;

  if (format.scoring === "rally") {
    next.current = addPoint(state.current, event.winner);
    next.servingTeam = event.winner;
    next.serverNumber = 1;
  } else if (servingWon) {
    next.current = addPoint(state.current, event.winner);
  } else if (format.mode === "doubles" && state.serverNumber === 1) {
    next.serverNumber = 2;
  } else {
    next.servingTeam = other(state.servingTeam);
    next.serverNumber = 1;
  }

  const midpoint = Math.ceil(format.pointsToWin / 2);
  const before = Math.max(state.current.a, state.current.b);
  const after = Math.max(next.current.a, next.current.b);
  if (before < midpoint && after >= midpoint && isDecidingGame(state, format)) {
    next.notice = "switch-ends";
  }

  return finishGameIfWon(next, format);
}

function finishGameIfWon(state: LiveState, format: MatchFormat): LiveState {
  const gameWinner = isGameWon(state.current, format);
  if (!gameWinner) return state;

  const games = [...state.games, state.current];
  const wins = gameWins(games);
  if (wins[gameWinner] >= gamesToWin(format)) {
    return { ...state, games, current: { a: 0, b: 0 }, winner: gameWinner, notice: "match-over" };
  }
  // Serve alternates between games.
  const firstServer = other(state.gameFirstServer);
  return {
    ...state,
    games,
    current: { a: 0, b: 0 },
    servingTeam: firstServer,
    gameFirstServer: firstServer,
    serverNumber: startingServerNumber(format),
    notice: "game-over",
  };
}

export function replay(format: MatchFormat, events: RallyEvent[], firstServer: Team = "A"): LiveState {
  return events.reduce((s, e) => applyEvent(s, e, format), initialState(format, firstServer));
}

/**
 * The score as the server calls it: serving team's score first.
 * Side-out doubles adds the server number ("4-2-1").
 */
export function scoreCall(state: LiveState, format: MatchFormat): string {
  if (state.winner) {
    const last = state.games[state.games.length - 1];
    return `${Math.max(last.a, last.b)}-${Math.min(last.a, last.b)}`;
  }
  const serving = state.servingTeam === "A" ? state.current.a : state.current.b;
  const receiving = state.servingTeam === "A" ? state.current.b : state.current.a;
  if (format.scoring === "sideout" && format.mode === "doubles") {
    return `${serving}-${receiving}-${state.serverNumber}`;
  }
  return `${serving}-${receiving}`;
}

/** Games for the result: completed games plus the in-progress one if it has points. */
export function resultGames(state: LiveState): GameResult[] {
  if (state.winner || (state.current.a === 0 && state.current.b === 0)) return state.games;
  return [...state.games, state.current];
}

/** Validate a manually entered final result against the format. */
export function validateFinalGames(games: GameResult[], format: MatchFormat): string | null {
  if (games.length === 0) return "Enter at least one game score.";
  if (games.length > format.bestOf) return `A best-of-${format.bestOf} has at most ${format.bestOf} games.`;
  const wins = { A: 0, B: 0 };
  for (const [i, g] of games.entries()) {
    if (![g.a, g.b].every((n) => Number.isInteger(n) && n >= 0)) return `Game ${i + 1}: scores must be whole numbers.`;
    const w = isGameWon(g, format);
    if (!w) {
      return `Game ${i + 1}: ${g.a}-${g.b} isn't a finished game to ${format.pointsToWin} (win by ${format.winBy}).`;
    }
    const over = Math.max(g.a, g.b) > format.pointsToWin && Math.abs(g.a - g.b) !== format.winBy;
    if (over) return `Game ${i + 1}: past ${format.pointsToWin}, a game ends as soon as the lead is ${format.winBy}.`;
    if (wins.A === gamesToWin(format) || wins.B === gamesToWin(format)) {
      return "The match was already decided before the last game.";
    }
    wins[w]++;
  }
  if (wins.A < gamesToWin(format) && wins.B < gamesToWin(format)) return "No team has won enough games yet.";
  return null;
}
