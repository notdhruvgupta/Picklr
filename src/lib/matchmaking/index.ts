/**
 * Matchmaking: fair doubles pairings, balanced team formation, and the
 * "who plays next" suggestion for sessions.
 */

import { expectedScore, type Mode } from "@/lib/elo";

export interface RatedPlayer {
  id: string;
  rating: number;
}

export interface Pairing {
  teamA: string[];
  teamB: string[];
  /** Probability team A wins. */
  expectedA: number;
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function pairingFor(a: RatedPlayer[], b: RatedPlayer[]): Pairing {
  return {
    teamA: a.map((p) => p.id),
    teamB: b.map((p) => p.id),
    expectedA: expectedScore(avg(a.map((p) => p.rating)), avg(b.map((p) => p.rating))),
  };
}

/** The three ways to split four players into two teams, fairest first. */
export function pairingOptions(four: RatedPlayer[]): Pairing[] {
  if (four.length !== 4) throw new Error("Need exactly four players");
  const [p, q, r, s] = four;
  return [pairingFor([p, q], [r, s]), pairingFor([p, r], [q, s]), pairingFor([p, s], [q, r])].sort(
    (x, y) => Math.abs(x.expectedA - 0.5) - Math.abs(y.expectedA - 0.5),
  );
}

export type TeamFormation = "balanced" | "snake" | "random";

/** All ways to split an even-sized list into unordered pairs. */
function* perfectMatchings<T>(items: T[]): Generator<[T, T][]> {
  if (items.length === 0) {
    yield [];
    return;
  }
  const [first, ...rest] = items;
  for (let i = 0; i < rest.length; i++) {
    const partner = rest[i];
    const remaining = [...rest.slice(0, i), ...rest.slice(i + 1)];
    for (const m of perfectMatchings(remaining)) yield [[first, partner], ...m];
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Split players into doubles teams.
 * - balanced: minimise the spread of team averages (exhaustive up to 12 players, snake beyond)
 * - snake: best with worst (1+N, 2+N-1, ...)
 * - random: a random draw
 * With an odd count, the lowest-rated player (or a random one) is left over.
 */
export function formTeams(
  players: RatedPlayer[],
  method: TeamFormation,
  random: () => number = Math.random,
): { teams: [string, string][]; leftover: string[] } {
  const sorted = [...players].sort((x, y) => y.rating - x.rating);
  let pool = sorted;
  let leftover: string[] = [];
  if (pool.length % 2 === 1) {
    const out = method === "random" ? pool[Math.floor(random() * pool.length)] : pool[pool.length - 1];
    leftover = [out.id];
    pool = pool.filter((p) => p !== out);
  }

  if (method === "random") {
    const s = shuffle(pool, random);
    const teams: [string, string][] = [];
    for (let i = 0; i < s.length; i += 2) teams.push([s[i].id, s[i + 1].id]);
    return { teams, leftover };
  }

  const snake = (): [RatedPlayer, RatedPlayer][] => {
    const t: [RatedPlayer, RatedPlayer][] = [];
    for (let i = 0; i < pool.length / 2; i++) t.push([pool[i], pool[pool.length - 1 - i]]);
    return t;
  };

  let best = snake();
  if (method === "balanced" && pool.length <= 12) {
    const spread = (m: [RatedPlayer, RatedPlayer][]) => {
      const avgs = m.map(([x, y]) => (x.rating + y.rating) / 2);
      const mean = avg(avgs);
      return avgs.reduce((s, v) => s + (v - mean) ** 2, 0);
    };
    let bestScore = spread(best);
    for (const m of perfectMatchings(pool)) {
      const score = spread(m);
      if (score < bestScore - 1e-9) {
        best = m;
        bestScore = score;
      }
    }
  }
  const teams = best
    .map(([x, y]) => (x.rating >= y.rating ? [x, y] : [y, x]) as [RatedPlayer, RatedPlayer])
    .sort((t1, t2) => t2[0].rating + t2[1].rating - (t1[0].rating + t1[1].rating))
    .map(([x, y]) => [x.id, y.id] as [string, string]);
  return { teams, leftover };
}

export interface SessionMatch {
  teamA: string[];
  teamB: string[];
}

export interface NextMatchSuggestion extends Pairing {
  sittingOut: string[];
  /** Short human-readable reasons for the pick. */
  notes: string[];
}

const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

function* combinations<T>(items: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) {
    yield* combinations(items, k, i + 1, [...acc, items[i]]);
  }
}

/**
 * Suggest the next match for a session on one court.
 *
 * Players who have played the fewest games (and waited longest) go on first;
 * among the eligible players we pick the group and split that avoids repeat
 * partners and opponents and is closest to a 50/50 match.
 */
export function suggestNextMatch(
  present: RatedPlayer[],
  played: SessionMatch[],
  mode: Mode,
  options: { unavailable?: string[]; random?: () => number } = {},
): NextMatchSuggestion | null {
  const random = options.random ?? Math.random;
  const unavailable = new Set(options.unavailable ?? []);
  const perTeam = mode === "doubles" ? 2 : 1;
  const needed = perTeam * 2;
  const available = present.filter((p) => !unavailable.has(p.id));
  if (available.length < needed) return null;

  const games = new Map<string, number>();
  const lastPlayed = new Map<string, number>();
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  played.forEach((m, i) => {
    for (const id of [...m.teamA, ...m.teamB]) {
      games.set(id, (games.get(id) ?? 0) + 1);
      lastPlayed.set(id, i);
    }
    for (const team of [m.teamA, m.teamB]) {
      for (const [x, y] of combinations(team, 2)) partners.set(pairKey(x, y), (partners.get(pairKey(x, y)) ?? 0) + 1);
    }
    for (const x of m.teamA) for (const y of m.teamB) opponents.set(pairKey(x, y), (opponents.get(pairKey(x, y)) ?? 0) + 1);
  });

  // Queue order: fewest games, then longest wait, then a random tiebreak.
  const tiebreak = new Map(available.map((p) => [p.id, random()]));
  const queue = [...available].sort(
    (x, y) =>
      (games.get(x.id) ?? 0) - (games.get(y.id) ?? 0) ||
      (lastPlayed.get(x.id) ?? -1) - (lastPlayed.get(y.id) ?? -1) ||
      tiebreak.get(x.id)! - tiebreak.get(y.id)!,
  );

  // Everyone with fewer games than the last guaranteed slot must play; the rest compete for remaining slots.
  const cutoff = games.get(queue[needed - 1].id) ?? 0;
  const mustPlay = queue.filter((p) => (games.get(p.id) ?? 0) < cutoff);
  const contenders = queue.filter((p) => (games.get(p.id) ?? 0) === cutoff).slice(0, 8);

  let best: { pairing: Pairing; cost: number } | null = null;
  for (const extra of combinations(contenders, needed - mustPlay.length)) {
    const group = [...mustPlay, ...extra];
    const waitBonus = extra.reduce((s, p) => s + queue.indexOf(p), 0);
    const options =
      mode === "doubles" ? pairingOptions(group) : [pairingFor([group[0]], [group[1]])];
    for (const pairing of options) {
      let repeats = 0;
      for (const team of [pairing.teamA, pairing.teamB]) {
        for (const [x, y] of combinations(team, 2)) repeats += 3 * (partners.get(pairKey(x, y)) ?? 0);
      }
      for (const x of pairing.teamA) for (const y of pairing.teamB) repeats += opponents.get(pairKey(x, y)) ?? 0;
      const imbalance = Math.abs(pairing.expectedA - 0.5);
      const cost = repeats * 4 + imbalance * 40 + waitBonus * 1.5;
      if (!best || cost < best.cost) best = { pairing, cost };
    }
  }
  if (!best) return null;

  const onCourt = new Set([...best.pairing.teamA, ...best.pairing.teamB]);
  const notes: string[] = [];
  const fresh = [...onCourt].filter((id) => !games.has(id));
  if (fresh.length) notes.push(`${fresh.length} player${fresh.length > 1 ? "s" : ""} yet to play`);
  if (Math.abs(best.pairing.expectedA - 0.5) < 0.05) notes.push("evenly matched");
  return {
    ...best.pairing,
    sittingOut: available.filter((p) => !onCourt.has(p.id)).map((p) => p.id),
    notes,
  };
}
