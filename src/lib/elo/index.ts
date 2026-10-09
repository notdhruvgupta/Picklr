/**
 * Elo rating engine.
 *
 * Ratings are a pure function of (starting ratings, ordered match history, config).
 * Nothing is ever patched in place: editing or voiding a match simply means
 * running the replay again, which takes milliseconds for a group this size.
 */

export type Mode = "singles" | "doubles";
export type Team = "A" | "B";

export interface EloConfig {
  /** Rating given to a player with no explicit starting rating. */
  baseRating: number;
  /** K-factor while a player has fewer than `provisionalMatches` matches in a mode. */
  kProvisional: number;
  /** K-factor once a player is established. */
  kEstablished: number;
  provisionalMatches: number;
  /** Scale rating changes by the margin of victory. */
  marginOfVictory: boolean;
  /** Per-game margin (in a game to 11) that yields a multiplier of exactly 1. */
  movReferenceMargin: number;
  /** Matches needed before a player gets a numbered leaderboard rank. */
  minMatchesRanked: number;
}

export const DEFAULT_ELO_CONFIG: EloConfig = {
  baseRating: 1500,
  kProvisional: 40,
  kEstablished: 24,
  provisionalMatches: 10,
  marginOfVictory: true,
  movReferenceMargin: 5,
  minMatchesRanked: 0,
};

export interface GameResult {
  a: number;
  b: number;
}

export interface EloMatch {
  id: string;
  mode: Mode;
  /** ISO timestamp; matches are replayed in this order (ties broken by id). */
  playedAt: string;
  teamA: string[];
  teamB: string[];
  games: GameResult[];
  pointsToWin: number;
}

export interface StartingRating {
  id: string;
  singles: number;
  doubles: number;
}

export interface RatingChange {
  matchId: string;
  playerId: string;
  mode: Mode;
  team: Team;
  before: number;
  after: number;
  delta: number;
  k: number;
  won: boolean;
}

export interface MatchRatingInfo {
  matchId: string;
  mode: Mode;
  winner: Team;
  teamARating: number;
  teamBRating: number;
  /** Probability team A was expected to win, before the match. */
  expectedA: number;
  mov: number;
  changes: RatingChange[];
}

export interface RatingPoint {
  matchId: string | null;
  playedAt: string | null;
  rating: number;
}

export interface PlayerModeStats {
  rating: number;
  start: number;
  peak: number;
  matches: number;
  wins: number;
  losses: number;
  /** Positive for a win streak, negative for a losing streak. */
  streak: number;
  bestWinStreak: number;
  lastPlayedAt: string | null;
  history: RatingPoint[];
}

export type PlayerRatings = Record<Mode, PlayerModeStats>;

export interface RatingsResult {
  byMatch: Map<string, MatchRatingInfo>;
  players: Map<string, PlayerRatings>;
}

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function teamRating(ratings: number[]): number {
  if (ratings.length === 0) throw new Error("A team needs at least one player");
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

/** Winner by games won; for a single game, by points. Null if undecided. */
export function matchWinner(games: GameResult[]): Team | null {
  let a = 0;
  let b = 0;
  for (const g of games) {
    if (g.a > g.b) a++;
    else if (g.b > g.a) b++;
  }
  if (a === b) return null;
  return a > b ? "A" : "B";
}

/**
 * Winner's average point margin per game, rescaled to a game to 11 so that
 * rally-scoring games to 15 or 21 are comparable. Never below 1.
 */
export function normalizedMargin(games: GameResult[], pointsToWin: number): number {
  const winner = matchWinner(games);
  if (!winner || games.length === 0) return 1;
  const diff = games.reduce((sum, g) => sum + (winner === "A" ? g.a - g.b : g.b - g.a), 0);
  const perGame = diff / games.length;
  return Math.max(1, (perGame * 11) / pointsToWin);
}

/** ln(margin + 1) / ln(reference + 1): 11-9 → 0.61, 11-6 → 1.00, 11-0 → 1.39. */
export function movMultiplier(games: GameResult[], pointsToWin: number, config: EloConfig): number {
  if (!config.marginOfVictory) return 1;
  const margin = normalizedMargin(games, pointsToWin);
  return Math.log(margin + 1) / Math.log(config.movReferenceMargin + 1);
}

export function kFactor(matchesPlayed: number, config: EloConfig): number {
  return matchesPlayed < config.provisionalMatches ? config.kProvisional : config.kEstablished;
}

function newModeStats(start: number): PlayerModeStats {
  return {
    rating: start,
    start,
    peak: start,
    matches: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    bestWinStreak: 0,
    lastPlayedAt: null,
    history: [{ matchId: null, playedAt: null, rating: start }],
  };
}

export function compareMatches(x: { playedAt: string; id: string }, y: { playedAt: string; id: string }): number {
  if (x.playedAt !== y.playedAt) return x.playedAt < y.playedAt ? -1 : 1;
  return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
}

export function computeRatings(
  starting: StartingRating[],
  matches: EloMatch[],
  config: EloConfig = DEFAULT_ELO_CONFIG,
): RatingsResult {
  const players = new Map<string, PlayerRatings>();
  for (const s of starting) {
    players.set(s.id, { singles: newModeStats(s.singles), doubles: newModeStats(s.doubles) });
  }
  const getPlayer = (id: string): PlayerRatings => {
    let p = players.get(id);
    if (!p) {
      p = { singles: newModeStats(config.baseRating), doubles: newModeStats(config.baseRating) };
      players.set(id, p);
    }
    return p;
  };

  const byMatch = new Map<string, MatchRatingInfo>();
  const ordered = [...matches].sort(compareMatches);

  for (const match of ordered) {
    const winner = matchWinner(match.games);
    if (!winner || match.teamA.length === 0 || match.teamB.length === 0) continue;

    const statsA = match.teamA.map((id) => getPlayer(id)[match.mode]);
    const statsB = match.teamB.map((id) => getPlayer(id)[match.mode]);
    const teamARating = teamRating(statsA.map((s) => s.rating));
    const teamBRating = teamRating(statsB.map((s) => s.rating));
    const expectedA = expectedScore(teamARating, teamBRating);
    const mov = movMultiplier(match.games, match.pointsToWin, config);
    const surpriseA = (winner === "A" ? 1 : 0) - expectedA;

    const changes: RatingChange[] = [];
    const apply = (ids: string[], stats: PlayerModeStats[], team: Team, surprise: number) => {
      ids.forEach((playerId, i) => {
        const s = stats[i];
        const k = kFactor(s.matches, config);
        const delta = k * mov * surprise;
        const won = winner === team;
        const before = s.rating;
        s.rating = before + delta;
        s.matches++;
        if (won) {
          s.wins++;
          s.streak = s.streak > 0 ? s.streak + 1 : 1;
          s.bestWinStreak = Math.max(s.bestWinStreak, s.streak);
        } else {
          s.losses++;
          s.streak = s.streak < 0 ? s.streak - 1 : -1;
        }
        s.peak = Math.max(s.peak, s.rating);
        s.lastPlayedAt = match.playedAt;
        s.history.push({ matchId: match.id, playedAt: match.playedAt, rating: s.rating });
        changes.push({ matchId: match.id, playerId, mode: match.mode, team, before, after: s.rating, delta, k, won });
      });
    };
    apply(match.teamA, statsA, "A", surpriseA);
    apply(match.teamB, statsB, "B", -surpriseA);

    byMatch.set(match.id, {
      matchId: match.id,
      mode: match.mode,
      winner,
      teamARating,
      teamBRating,
      expectedA,
      mov,
      changes,
    });
  }

  return { byMatch, players };
}

/** What each side stands to gain if it wins by the reference margin. */
export function previewMatch(
  teamA: { rating: number; matches: number }[],
  teamB: { rating: number; matches: number }[],
  config: EloConfig = DEFAULT_ELO_CONFIG,
) {
  const expectedA = expectedScore(
    teamRating(teamA.map((p) => p.rating)),
    teamRating(teamB.map((p) => p.rating)),
  );
  const gain = (p: { matches: number }, surprise: number) => kFactor(p.matches, config) * surprise;
  return {
    expectedA,
    ifAWins: teamA.map((p) => gain(p, 1 - expectedA)),
    ifBWins: teamB.map((p) => gain(p, expectedA)),
  };
}

export interface LeaderboardRow {
  playerId: string;
  rank: number | null;
  stats: PlayerModeStats;
  provisional: boolean;
}

/** Players sorted by rating; those under `minMatchesRanked` are listed after, unranked. */
export function leaderboard(
  result: RatingsResult,
  mode: Mode,
  playerIds: string[],
  config: EloConfig = DEFAULT_ELO_CONFIG,
): LeaderboardRow[] {
  const rows = playerIds
    .map((id) => {
      const stats = result.players.get(id)?.[mode];
      return stats ? { playerId: id, stats } : null;
    })
    .filter((r): r is { playerId: string; stats: PlayerModeStats } => r !== null);

  const ranked = rows
    .filter((r) => r.stats.matches >= config.minMatchesRanked)
    .sort((x, y) => y.stats.rating - x.stats.rating);
  const unranked = rows
    .filter((r) => r.stats.matches < config.minMatchesRanked)
    .sort((x, y) => y.stats.rating - x.stats.rating);

  return [
    ...ranked.map((r, i) => ({ ...r, rank: i + 1, provisional: r.stats.matches < config.provisionalMatches })),
    ...unranked.map((r) => ({ ...r, rank: null, provisional: true })),
  ];
}
