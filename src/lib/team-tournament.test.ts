import { describe, expect, it } from "vitest";
import {
  allowedPairs,
  formTeamsOfThree,
  lineupFeasible,
  playerCaps,
  teamFinalMatch,
  teamMatchCount,
  teamRoundRobinMatches,
  teamSizes,
  teamUsage,
} from "./team-tournament";
import type { TournamentSpec } from "./tournament";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, rating: 1700 - i * 37 }));
const avg = (ids: string[], all: { id: string; rating: number }[]) => ids.reduce((s, id) => s + all.find((p) => p.id === id)!.rating, 0) / ids.length;

describe("teamSizes", () => {
  it("makes teams of 3, with teams of 4 for the leftovers", () => {
    expect(teamSizes(9)).toEqual([3, 3, 3]);
    expect(teamSizes(10)).toEqual([4, 3, 3]);
    expect(teamSizes(8)).toEqual([4, 4]);
    expect(teamSizes(7)).toEqual([4, 3]);
    expect(teamSizes(12)).toEqual([3, 3, 3, 3]);
    expect(() => teamSizes(5)).toThrow();
  });
});

describe("playerCaps", () => {
  it("matches the agreed numbers for 3 teams of 3", () => {
    expect(playerCaps(3, teamMatchCount(3, 2))).toEqual({ min: 2, max: 3 }); // double RR: 3/3/2
    expect(playerCaps(3, teamMatchCount(3, 3))).toEqual({ min: 4, max: 4 }); // triple RR: 4/4/4
  });

  it("gives a team of 4 half its matches each", () => {
    expect(playerCaps(4, teamMatchCount(3, 2))).toEqual({ min: 2, max: 2 });
    expect(playerCaps(4, teamMatchCount(2, 3))).toEqual({ min: 1, max: 2 });
  });
});

describe("formTeamsOfThree", () => {
  it("uses everyone exactly once in teams of the right sizes", () => {
    for (const method of ["balanced", "snake", "random"] as const) {
      for (const n of [6, 7, 8, 9, 10, 11, 12, 13]) {
        const teams = formTeamsOfThree(ratings(n), method, () => 0.42);
        expect(teams.flat().sort()).toEqual(ratings(n).map((p) => p.id).sort());
        expect(teams.map((t) => t.length).sort()).toEqual(teamSizes(n).sort());
      }
    }
  });

  it("balanced teams are at least as even as a snake draft", () => {
    for (const n of [9, 10, 11, 12]) {
      const players = ratings(n).map((p, i) => ({ ...p, rating: p.rating + ((i * 53) % 90) }));
      const range = (teams: string[][]) => {
        const avgs = teams.map((t) => avg(t, players));
        return Math.max(...avgs) - Math.min(...avgs);
      };
      expect(range(formTeamsOfThree(players, "balanced"))).toBeLessThanOrEqual(range(formTeamsOfThree(players, "snake")) + 1e-9);
    }
  });

  it("lists teams strongest first and each team strongest first", () => {
    const players = ratings(9);
    const teams = formTeamsOfThree(players, "snake");
    expect(avg(teams[0], players)).toBeGreaterThanOrEqual(avg(teams[2], players));
    for (const t of teams) expect(t).toEqual([...t].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1))));
  });
});

describe("lineups", () => {
  const roster = ["g", "t", "y"];
  const caps = playerCaps(3, 4); // double RR with 3 teams: min 2, max 3

  it("blocks the lineup that would leave the last match unplayable", () => {
    // Gaurav & Tarang already played twice together; one more G&T would cap them both
    // with Yatharth needing 2 of the last... only 1 match left.
    const counts = new Map([
      ["g", 2],
      ["t", 2],
    ]);
    const pairs = allowedPairs(roster, counts, 1, caps);
    expect(pairs).not.toContainEqual(["g", "t"]);
    expect(pairs).toEqual([
      ["g", "y"],
      ["t", "y"],
    ]);
  });

  it("forces the triple round robin to exactly 4 each", () => {
    const triple = playerCaps(3, 6);
    const counts = new Map([
      ["g", 4],
      ["t", 3],
      ["y", 3],
    ]);
    // 5 of 6 matches lined up (counts sum to 10); this is the last one.
    expect(allowedPairs(roster, counts, 0, triple)).toEqual([["t", "y"]]);
  });

  it("any sequence of allowed picks finishes with everyone between min and max", () => {
    for (const [teams, cycles, size] of [
      [3, 2, 3],
      [3, 3, 3],
      [4, 2, 3],
      [3, 2, 4],
      [2, 3, 4],
    ] as const) {
      const ids = Array.from({ length: size }, (_, i) => `x${i}`);
      const m = teamMatchCount(teams, cycles);
      const c = playerCaps(size, m);
      // Explore every path of allowed choices.
      const walk = (counts: Map<string, number>, left: number): void => {
        if (left === 0) {
          for (const id of ids) {
            const n = counts.get(id) ?? 0;
            expect(n).toBeGreaterThanOrEqual(c.min);
            expect(n).toBeLessThanOrEqual(c.max);
          }
          return;
        }
        const pairs = allowedPairs(ids, counts, left - 1, c);
        expect(pairs.length).toBeGreaterThan(0);
        for (const [x, y] of pairs) {
          const next = new Map(counts);
          next.set(x, (next.get(x) ?? 0) + 1);
          next.set(y, (next.get(y) ?? 0) + 1);
          walk(next, left - 1);
        }
      };
      expect(lineupFeasible(ids, new Map(), m, c)).toBe(true);
      walk(new Map(), m);
    }
  });

  it("counts a team's lineups across matches, skipping the one being edited and voided ones", () => {
    const usage = teamUsage(
      "E1",
      [
        { id: "m1", entryA: "E1", entryB: "E2", teamA: ["g", "t"], teamB: [], void: false },
        { id: "m2", entryA: "E3", entryB: "E1", teamA: [], teamB: ["g", "y"], void: false },
        { id: "m3", entryA: "E1", entryB: "E3", teamA: [], teamB: [], void: false },
        { id: "m4", entryA: "E1", entryB: "E2", teamA: ["t", "y"], teamB: [], void: true },
      ],
      "m2",
    );
    expect(Object.fromEntries(usage.counts)).toEqual({ g: 1, t: 1 });
    expect(usage.withoutLineup).toBe(1);
  });
});

describe("schedule", () => {
  const spec: TournamentSpec = { id: "t", format: "team_round_robin", mode: "doubles", scoring: "sideout", pointsToWin: 11, winBy: 2, bestOf: 1, isRated: true, cycles: 2 };
  const entries = ["e1", "e2", "e3"].map((id, i) => ({ id, seed: i + 1 }));

  it("builds a double round robin between teams with lineups left open", () => {
    const rows = teamRoundRobinMatches(spec, entries, (() => {
      let n = 0;
      return () => `m${++n}`;
    })());
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.team_a.length === 0 && r.team_b.length === 0 && r.stage === "group")).toBe(true);
    for (const e of entries) {
      expect(rows.filter((r) => r.entry_a_id === e.id || r.entry_b_id === e.id)).toHaveLength(teamMatchCount(3, 2));
    }
    expect(rows[0].bracket_label).toBe("Leg 1 · Round 1");
  });

  it("builds the final with the first-placed team as team A", () => {
    const f = teamFinalMatch(spec, "e2", "e1", { scoring: "rally", pointsToWin: 21, winBy: 2, subThreshold: 10 }, "f1", 7);
    expect(f).toMatchObject({ entry_a_id: "e2", entry_b_id: "e1", points_to_win: 21, scoring: "rally", sub_threshold: 10, bracket_key: "F", stage: "playoff", best_of: 1 });
  });
});
