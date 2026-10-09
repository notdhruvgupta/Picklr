import { describe, expect, it } from "vitest";
import { doubleElimination, roundRobin, seedPositions, singleElimination, standings, type BracketMatch } from "./index";

const seedsIn = (m: BracketMatch) =>
  [m.a, m.b].map((s) => (s.type === "seed" ? s.seed : null)).filter((s): s is number => s !== null);

/** Simulate a bracket where the better (lower) seed always wins; returns the champion. */
function simulate(matches: BracketMatch[], upsetKeys = new Set<string>()): { champion: number; played: string[] } {
  const slots = new Map<string, { A?: number; B?: number }>();
  for (const m of matches) {
    const s: { A?: number; B?: number } = {};
    if (m.a.type === "seed") s.A = m.a.seed;
    if (m.b.type === "seed") s.B = m.b.seed;
    slots.set(m.key, s);
  }
  const played: string[] = [];
  let champion = -1;
  for (const m of matches) {
    const s = slots.get(m.key)!;
    if (s.A === undefined || s.B === undefined) {
      if (m.conditional) continue;
      throw new Error(`${m.key} not ready`);
    }
    played.push(m.key);
    let [w, l] = s.A < s.B ? [s.A, s.B] : [s.B, s.A];
    if (upsetKeys.has(m.key)) [w, l] = [l, w];
    champion = w;
    if (m.winnerTo) {
      const target = matches.find((x) => x.key === m.winnerTo!.key)!;
      // A grand-final reset is only played when the losers-bracket entry (slot B) wins.
      if (!(target.conditional && w === s.A)) slots.get(m.winnerTo.key)![m.winnerTo.slot] = w;
    }
    if (m.loserTo) {
      const target = matches.find((x) => x.key === m.loserTo!.key)!;
      if (!(target.conditional && w === s.A)) slots.get(m.loserTo.key)![m.loserTo.slot] = l;
    }
  }
  return { champion, played };
}

describe("seedPositions", () => {
  it("places seeds so 1 and 2 can only meet in the final", () => {
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(seedPositions(4)).toEqual([1, 4, 2, 3]);
    expect(() => seedPositions(6)).toThrow();
  });
});

describe("singleElimination", () => {
  it("builds a full 8-team bracket", () => {
    const b = singleElimination(8);
    expect(b).toHaveLength(7);
    expect(b.filter((m) => m.round === 1).map(seedsIn)).toEqual([[1, 8], [4, 5], [2, 7], [3, 6]]);
    expect(b.find((m) => m.round === 3)!.label).toBe("Final");
    expect(simulate(b).champion).toBe(1);
  });

  it("gives byes to the top seeds when the field is not a power of two", () => {
    const b = singleElimination(5);
    // 8-slot bracket: seeds 1-3 get byes, only 4v5 is played in round 1.
    expect(b.filter((m) => m.round === 1).map(seedsIn)).toEqual([[4, 5]]);
    expect(b).toHaveLength(4);
    // Only number matches when a round still has more than one.
    expect(b.map((m) => m.label)).toEqual(["Quarterfinal", "Semifinal 1", "Semifinal 2", "Final"]);
    const semi1 = b.find((m) => m.key === "W2-1")!;
    expect(semi1.a).toEqual({ type: "seed", seed: 1 });
    expect(semi1.b).toEqual({ type: "winner", key: "W1-2" });
    expect(b.find((m) => m.key === "W1-2")!.winnerTo).toEqual({ key: "W2-1", slot: "B" });
    expect(simulate(b).champion).toBe(1);
  });

  it("handles two entries", () => {
    const b = singleElimination(2);
    expect(b).toHaveLength(1);
    expect(b[0].label).toBe("Final");
  });

  it("every match except the final feeds another", () => {
    for (const n of [3, 5, 6, 7, 9, 10]) {
      const b = singleElimination(n);
      expect(b).toHaveLength(n - 1);
      expect(b.filter((m) => !m.winnerTo)).toHaveLength(1);
    }
  });
});

describe("doubleElimination", () => {
  it("builds an 8-team bracket with a conditional reset", () => {
    const b = doubleElimination(8);
    // 7 winners + 6 losers + grand final + reset
    expect(b).toHaveLength(15);
    expect(b.filter((m) => m.bracket === "L")).toHaveLength(6);
    expect(b.find((m) => m.conditional)!.label).toBe("Grand Final (if needed)");
    const { champion, played } = simulate(b);
    expect(champion).toBe(1);
    expect(played).not.toContain("GF2-1");
  });

  it("plays the reset when the losers-bracket champion wins the grand final", () => {
    const b = doubleElimination(4);
    const { played } = simulate(b, new Set(["GF1-1"]));
    expect(played).toContain("GF2-1");
  });

  it("every entry except the champion loses exactly twice when the favourite always wins", () => {
    for (const n of [3, 4, 5, 6, 8, 10]) {
      const b = doubleElimination(n);
      const losses = new Map<number, number>();
      const slots = new Map<string, { A?: number; B?: number }>();
      for (const m of b) slots.set(m.key, { A: m.a.type === "seed" ? m.a.seed : undefined, B: m.b.type === "seed" ? m.b.seed : undefined });
      for (const m of b) {
        const s = slots.get(m.key)!;
        if (s.A === undefined || s.B === undefined) continue;
        const [w, l] = s.A < s.B ? [s.A, s.B] : [s.B, s.A];
        losses.set(l, (losses.get(l) ?? 0) + 1);
        if (m.winnerTo && !b.find((x) => x.key === m.winnerTo!.key)!.conditional) slots.get(m.winnerTo.key)![m.winnerTo.slot] = w;
        if (m.loserTo && !b.find((x) => x.key === m.loserTo!.key)!.conditional) slots.get(m.loserTo.key)![m.loserTo.slot] = l;
      }
      for (let seed = 2; seed <= n; seed++) expect(losses.get(seed), `n=${n} seed=${seed}`).toBe(2);
      expect(losses.get(1) ?? 0).toBe(0);
    }
  });
});

describe("roundRobin", () => {
  it("pairs everyone exactly once", () => {
    for (const n of [2, 3, 4, 5, 6, 9, 10]) {
      const rounds = roundRobin(n);
      const seen = new Set<string>();
      for (const round of rounds) {
        const inRound = new Set<number>();
        for (const [a, b] of round) {
          const k = [a, b].sort((x, y) => x - y).join("-");
          expect(seen.has(k)).toBe(false);
          seen.add(k);
          expect(inRound.has(a) || inRound.has(b)).toBe(false);
          inRound.add(a).add(b);
        }
      }
      expect(seen.size).toBe((n * (n - 1)) / 2);
    }
  });

  it("gives each team one bye when the count is odd", () => {
    expect(roundRobin(5)).toHaveLength(5);
    expect(roundRobin(5).every((r) => r.length === 2)).toBe(true);
  });
});

describe("standings", () => {
  const entries = ["t1", "t2", "t3"].map((id, i) => ({ id, seed: i + 1 }));

  it("sorts by wins, then head-to-head", () => {
    const table = standings(entries, [
      { a: "t1", b: "t2", winner: "B", pointsA: 9, pointsB: 11 },
      { a: "t1", b: "t3", winner: "A", pointsA: 11, pointsB: 2 },
      { a: "t2", b: "t3", winner: "B", pointsA: 10, pointsB: 12 },
    ]);
    // All 1-1; head-to-head within the 3-way tie is 1-1-1, so point differential decides: t1 +7, t3 -7, t2 0.
    expect(table.map((r) => r.entryId)).toEqual(["t1", "t2", "t3"]);
    expect(table[0]).toMatchObject({ wins: 1, losses: 1, pointsFor: 20, pointsAgainst: 13 });
  });

  it("uses head-to-head for a two-way tie", () => {
    const four = ["a", "b", "c", "d"].map((id, i) => ({ id, seed: i + 1 }));
    const table = standings(four, [
      { a: "a", b: "b", winner: "B", pointsA: 10, pointsB: 12 },
      { a: "a", b: "c", winner: "A", pointsA: 11, pointsB: 0 },
      { a: "a", b: "d", winner: "A", pointsA: 11, pointsB: 0 },
      { a: "b", b: "c", winner: "A", pointsA: 11, pointsB: 9 },
      { a: "b", b: "d", winner: "B", pointsA: 9, pointsB: 11 },
      { a: "c", b: "d", winner: "A", pointsA: 11, pointsB: 9 },
    ]);
    // a and b are both 2-1 and a has the far better point differential, but b won head-to-head.
    // c and d are both 1-2; c won head-to-head.
    expect(table.map((r) => r.entryId)).toEqual(["b", "a", "c", "d"]);
  });
});
