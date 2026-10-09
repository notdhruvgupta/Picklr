import { describe, expect, it } from "vitest";
import { formTeams, pairingOptions, suggestNextMatch, type RatedPlayer, type SessionMatch } from "./index";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const players = (ratings: number[]): RatedPlayer[] => ratings.map((rating, i) => ({ id: `p${i + 1}`, rating }));

describe("pairingOptions", () => {
  it("puts the strongest with the weakest first", () => {
    const [best] = pairingOptions(players([1700, 1600, 1500, 1400]));
    const teams = [best.teamA, best.teamB].map((t) => [...t].sort());
    expect(teams).toContainEqual(["p1", "p4"]);
    expect(best.expectedA).toBeCloseTo(0.5, 5);
  });
});

describe("formTeams", () => {
  it("snake-pairs best with worst", () => {
    const { teams, leftover } = formTeams(players([1900, 1800, 1700, 1600, 1500, 1400]), "snake");
    expect(teams).toEqual([
      ["p1", "p6"],
      ["p2", "p5"],
      ["p3", "p4"],
    ]);
    expect(leftover).toEqual([]);
  });

  it("balanced is at least as even as snake", () => {
    const ps = players([1700, 1650, 1640, 1500, 1480, 1300, 1290, 1200]);
    const spread = (teams: [string, string][]) => {
      const r = new Map(ps.map((p) => [p.id, p.rating]));
      const avgs = teams.map(([x, y]) => (r.get(x)! + r.get(y)!) / 2);
      return Math.max(...avgs) - Math.min(...avgs);
    };
    expect(spread(formTeams(ps, "balanced").teams)).toBeLessThanOrEqual(spread(formTeams(ps, "snake").teams));
  });

  it("leaves the lowest rated out with an odd count", () => {
    expect(formTeams(players([1500, 1400, 1300]), "balanced").leftover).toEqual(["p3"]);
  });

  it("random uses every player once", () => {
    const { teams } = formTeams(players([1, 2, 3, 4, 5, 6, 7, 8]), "random", seeded(7));
    expect(teams.flat().sort()).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"]);
  });
});

describe("suggestNextMatch", () => {
  const ten = players([1650, 1620, 1600, 1560, 1510, 1490, 1490, 1450, 1390, 1350]);

  it("returns null without enough players", () => {
    expect(suggestNextMatch(ten.slice(0, 3), [], "doubles")).toBeNull();
  });

  it("rotates everyone fairly over a session on one court", () => {
    const played: SessionMatch[] = [];
    const random = seeded(42);
    for (let round = 0; round < 10; round++) {
      const s = suggestNextMatch(ten, played, "doubles", { random })!;
      expect(s.sittingOut).toHaveLength(6);
      played.push({ teamA: s.teamA, teamB: s.teamB });
    }
    // 10 matches × 4 slots = 40 slots over 10 players: everyone plays exactly 4.
    const counts = new Map<string, number>();
    for (const m of played) for (const id of [...m.teamA, ...m.teamB]) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect([...counts.values()].every((c) => c === 4)).toBe(true);

    // Nobody should partner the same person twice in 10 matches when there are 45 possible pairs.
    const partnerships = played.flatMap((m) => [m.teamA, m.teamB].map((t) => [...t].sort().join("|")));
    expect(new Set(partnerships).size).toBe(partnerships.length);
  });

  it("never picks unavailable players", () => {
    const s = suggestNextMatch(ten, [], "doubles", { unavailable: ["p1", "p2"], random: seeded(1) })!;
    expect([...s.teamA, ...s.teamB]).not.toContain("p1");
    expect(s.sittingOut).not.toContain("p1");
  });

  it("works for singles", () => {
    const s = suggestNextMatch(ten.slice(0, 3), [{ teamA: ["p1"], teamB: ["p2"] }], "singles", { random: seeded(3) })!;
    expect([...s.teamA, ...s.teamB]).toContain("p3");
  });
});
