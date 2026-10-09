/**
 * Tournament structures: seeding, elimination brackets and round robins.
 *
 * Everything here works on seed numbers (1 = best). The caller maps seeds to
 * entries (players or doubles teams) and persists the generated matches.
 */

import type { Team } from "@/lib/elo";

export type SlotSource =
  | { type: "seed"; seed: number }
  | { type: "winner"; key: string }
  | { type: "loser"; key: string }
  | { type: "bye" };

export interface BracketMatch {
  key: string;
  bracket: "W" | "L" | "GF";
  round: number;
  index: number;
  label: string;
  a: SlotSource;
  b: SlotSource;
  winnerTo: { key: string; slot: Team } | null;
  loserTo: { key: string; slot: Team } | null;
  /** Only played if the entry in slot B wins the match feeding slot A (grand final reset). */
  conditional: boolean;
}

export function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/**
 * Seeds in bracket order so the top seeds meet as late as possible.
 * size 8 → [1, 8, 4, 5, 2, 7, 3, 6]: matches 1v8, 4v5, 2v7, 3v6.
 */
export function seedPositions(size: number): number[] {
  if (size < 2 || nextPowerOfTwo(size) !== size) throw new Error("Bracket size must be a power of two ≥ 2");
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

const key = (bracket: string, round: number, index: number) => `${bracket}${round}-${index}`;

function roundName(roundsFromEnd: number): string {
  if (roundsFromEnd === 0) return "Final";
  if (roundsFromEnd === 1) return "Semifinal";
  if (roundsFromEnd === 2) return "Quarterfinal";
  return `Round of ${2 ** (roundsFromEnd + 1)}`;
}

function blank(
  bracket: BracketMatch["bracket"],
  round: number,
  index: number,
  label: string,
  a: SlotSource,
  b: SlotSource,
): BracketMatch {
  return { key: key(bracket, round, index), bracket, round, index, label, a, b, winnerTo: null, loserTo: null, conditional: false };
}

function winnersBracket(entryCount: number, double: boolean): { matches: BracketMatch[]; rounds: number; size: number } {
  if (!Number.isInteger(entryCount) || entryCount < 2) throw new Error("A bracket needs at least 2 entries");
  const size = nextPowerOfTwo(entryCount);
  const rounds = Math.log2(size);
  const positions = seedPositions(size);
  const matches: BracketMatch[] = [];
  const seedOrBye = (seed: number): SlotSource => (seed <= entryCount ? { type: "seed", seed } : { type: "bye" });

  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    const name = roundName(rounds - r);
    for (let i = 1; i <= count; i++) {
      const label = `${double ? "Winners " : ""}${name}`;
      const a: SlotSource = r === 1 ? seedOrBye(positions[2 * i - 2]) : { type: "winner", key: key("W", r - 1, 2 * i - 1) };
      const b: SlotSource = r === 1 ? seedOrBye(positions[2 * i - 1]) : { type: "winner", key: key("W", r - 1, 2 * i) };
      matches.push(blank("W", r, i, label, a, b));
    }
  }
  return { matches, rounds, size };
}

export function singleElimination(entryCount: number): BracketMatch[] {
  return finalize(winnersBracket(entryCount, false).matches);
}

export function doubleElimination(entryCount: number): BracketMatch[] {
  const { matches, rounds: k, size } = winnersBracket(entryCount, true);
  const losersRounds = 2 * (k - 1);
  let losersChampion: SlotSource = { type: "loser", key: key("W", 1, 1) };

  if (k >= 2) {
    const lLabel = (r: number) => (r === losersRounds ? "Losers Final" : `Losers Round ${r}`);

    const l1Count = size / 4;
    for (let i = 1; i <= l1Count; i++) {
      matches.push(
        blank("L", 1, i, lLabel(1), { type: "loser", key: key("W", 1, 2 * i - 1) }, { type: "loser", key: key("W", 1, 2 * i) }),
      );
    }
    for (let j = 1; j <= k - 1; j++) {
      // Drop-in round: survivors meet losers from winners round j+1, order flipped to avoid quick rematches.
      const dropRound = 2 * j;
      const dropCount = size / 2 ** (j + 1);
      for (let i = 1; i <= dropCount; i++) {
        const w = j % 2 === 1 ? dropCount + 1 - i : i;
        matches.push(
          blank(
            "L",
            dropRound,
            i,
            lLabel(dropRound),
            { type: "winner", key: key("L", dropRound - 1, i) },
            { type: "loser", key: key("W", j + 1, w) },
          ),
        );
      }
      if (j < k - 1) {
        const consolidation = dropRound + 1;
        const count = size / 2 ** (j + 2);
        for (let i = 1; i <= count; i++) {
          matches.push(
            blank(
              "L",
              consolidation,
              i,
              lLabel(consolidation),
              { type: "winner", key: key("L", dropRound, 2 * i - 1) },
              { type: "winner", key: key("L", dropRound, 2 * i) },
            ),
          );
        }
      }
    }
    losersChampion = { type: "winner", key: key("L", losersRounds, 1) };
  }

  matches.push(blank("GF", 1, 1, "Grand Final", { type: "winner", key: key("W", k, 1) }, losersChampion));
  const reset = blank("GF", 2, 1, "Grand Final (if needed)", { type: "winner", key: "GF1-1" }, { type: "loser", key: "GF1-1" });
  reset.conditional = true;
  matches.push(reset);
  return finalize(matches);
}

/**
 * Remove matches that contain a bye (the other side advances automatically),
 * then derive each match's winner/loser destinations from the slot sources.
 */
function finalize(all: BracketMatch[]): BracketMatch[] {
  const byKey = new Map(all.map((m) => [m.key, m]));
  const removed = new Map<string, { winner: SlotSource; loser: SlotSource }>();

  const resolve = (src: SlotSource): SlotSource => {
    if (src.type !== "winner" && src.type !== "loser") return src;
    const gone = removed.get(src.key);
    if (gone) return resolve(src.type === "winner" ? gone.winner : gone.loser);
    if (!byKey.has(src.key)) throw new Error(`Unknown match ${src.key}`);
    return src;
  };

  // Sources always point at earlier matches, so a few passes reach a fixed point.
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of all) {
      if (removed.has(m.key)) continue;
      m.a = resolve(m.a);
      m.b = resolve(m.b);
      const aBye = m.a.type === "bye";
      const bBye = m.b.type === "bye";
      if (aBye || bBye) {
        removed.set(m.key, { winner: aBye ? m.b : m.a, loser: { type: "bye" } });
        changed = true;
      }
    }
  }

  const kept = all.filter((m) => !removed.has(m.key));
  // Number matches within a round only when more than one survived the byes.
  const perRound = new Map<string, BracketMatch[]>();
  for (const m of kept) perRound.set(`${m.bracket}${m.round}`, [...(perRound.get(`${m.bracket}${m.round}`) ?? []), m]);
  for (const group of perRound.values()) {
    if (group.length > 1) group.forEach((m, i) => (m.label = `${m.label} ${i + 1}`));
  }
  for (const m of kept) {
    m.winnerTo = null;
    m.loserTo = null;
  }
  const keptByKey = new Map(kept.map((m) => [m.key, m]));
  for (const m of kept) {
    for (const slot of ["A", "B"] as const) {
      const src = slot === "A" ? m.a : m.b;
      if (src.type === "winner") keptByKey.get(src.key)!.winnerTo = { key: m.key, slot };
      if (src.type === "loser") keptByKey.get(src.key)!.loserTo = { key: m.key, slot };
    }
  }
  return kept;
}

/** Circle-method round robin. Returns rounds of [seedA, seedB] pairs; odd counts get a rotating bye. */
export function roundRobin(entryCount: number): [number, number][][] {
  if (!Number.isInteger(entryCount) || entryCount < 2) throw new Error("A round robin needs at least 2 entries");
  const ids = Array.from({ length: entryCount }, (_, i) => i + 1);
  if (entryCount % 2 === 1) ids.push(0); // 0 = bye
  const n = ids.length;
  const rounds: [number, number][][] = [];
  let order = ids;
  for (let r = 0; r < n - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const x = order[i];
      const y = order[n - 1 - i];
      if (x === 0 || y === 0) continue;
      // Alternate sides so nobody is always "team A".
      pairs.push(r % 2 === 0 ? [Math.min(x, y), Math.max(x, y)] : [Math.max(x, y), Math.min(x, y)]);
    }
    rounds.push(pairs);
    order = [order[0], order[n - 1], ...order.slice(1, n - 1)];
  }
  return rounds;
}

export interface StandingsResult {
  a: string;
  b: string;
  winner: Team;
  pointsA: number;
  pointsB: number;
}

export interface Standing {
  entryId: string;
  seed: number;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * Round-robin table. Ties on wins are broken by head-to-head wins among the
 * tied entries, then point differential, points scored, and finally seed.
 */
export function standings(entries: { id: string; seed: number }[], results: StandingsResult[]): Standing[] {
  const table = new Map<string, Standing>(
    entries.map((e) => [e.id, { entryId: e.id, seed: e.seed, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }]),
  );
  for (const r of results) {
    const a = table.get(r.a);
    const b = table.get(r.b);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    a.pointsFor += r.pointsA;
    a.pointsAgainst += r.pointsB;
    b.pointsFor += r.pointsB;
    b.pointsAgainst += r.pointsA;
    if (r.winner === "A") {
      a.wins++;
      b.losses++;
    } else {
      b.wins++;
      a.losses++;
    }
  }

  const rows = [...table.values()];
  const byWins = new Map<number, Standing[]>();
  for (const row of rows) byWins.set(row.wins, [...(byWins.get(row.wins) ?? []), row]);

  const h2h = new Map<string, number>();
  for (const [, group] of byWins) {
    if (group.length < 2) continue;
    const ids = new Set(group.map((g) => g.entryId));
    for (const r of results) {
      if (ids.has(r.a) && ids.has(r.b)) {
        const w = r.winner === "A" ? r.a : r.b;
        h2h.set(w, (h2h.get(w) ?? 0) + 1);
      }
    }
  }

  return rows.sort(
    (x, y) =>
      y.wins - x.wins ||
      (h2h.get(y.entryId) ?? 0) - (h2h.get(x.entryId) ?? 0) ||
      y.pointsFor - y.pointsAgainst - (x.pointsFor - x.pointsAgainst) ||
      y.pointsFor - x.pointsFor ||
      x.seed - y.seed,
  );
}
