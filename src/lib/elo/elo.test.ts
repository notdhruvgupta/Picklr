import { describe, expect, it } from "vitest";
import {
  DEFAULT_ELO_CONFIG,
  computeRatings,
  expectedScore,
  leaderboard,
  matchWinner,
  movMultiplier,
  normalizedMargin,
  type EloMatch,
} from "./index";

const cfg = DEFAULT_ELO_CONFIG;
const fixed = { ...cfg, kProvisional: 32, kEstablished: 32 };

function doubles(id: string, playedAt: string, a: string[], b: string[], scoreA: number, scoreB: number): EloMatch {
  return { id, mode: "doubles", playedAt, teamA: a, teamB: b, games: [{ a: scoreA, b: scoreB }], pointsToWin: 11 };
}

describe("expectedScore", () => {
  it("is 0.5 for equal ratings and symmetric", () => {
    expect(expectedScore(1500, 1500)).toBe(0.5);
    expect(expectedScore(1600, 1400) + expectedScore(1400, 1600)).toBeCloseTo(1, 12);
  });

  it("gives ~76% to a 200-point favourite", () => {
    expect(expectedScore(1700, 1500)).toBeCloseTo(0.7597, 4);
  });
});

describe("margin of victory", () => {
  it("matches the documented multipliers for games to 11", () => {
    expect(movMultiplier([{ a: 11, b: 9 }], 11, cfg)).toBeCloseTo(0.613, 3);
    expect(movMultiplier([{ a: 11, b: 6 }], 11, cfg)).toBeCloseTo(1, 10);
    expect(movMultiplier([{ a: 0, b: 11 }], 11, cfg)).toBeCloseTo(1.387, 3);
  });

  it("normalises rally games to 21 onto the 11-point scale", () => {
    expect(normalizedMargin([{ a: 21, b: 11 }], 21)).toBeCloseTo((10 * 11) / 21, 10);
  });

  it("is 1 when disabled", () => {
    expect(movMultiplier([{ a: 11, b: 0 }], 11, { ...cfg, marginOfVictory: false })).toBe(1);
  });

  it("uses per-game margin across a best-of-3 and never drops below 1", () => {
    // A wins 2-1 but is outscored overall: margin floors at 1.
    const games = [
      { a: 11, b: 9 },
      { a: 2, b: 11 },
      { a: 11, b: 9 },
    ];
    expect(matchWinner(games)).toBe("A");
    expect(normalizedMargin(games, 11)).toBe(1);
  });
});

describe("computeRatings", () => {
  const starting = [
    { id: "p1", singles: 1500, doubles: 1600 },
    { id: "p2", singles: 1500, doubles: 1400 },
    { id: "p3", singles: 1500, doubles: 1550 },
    { id: "p4", singles: 1500, doubles: 1550 },
  ];

  it("reproduces the worked example from the design (+18.3 each)", () => {
    const result = computeRatings(starting, [doubles("m1", "2026-01-01T10:00:00Z", ["p1", "p2"], ["p3", "p4"], 11, 6)], fixed);
    const info = result.byMatch.get("m1")!;
    expect(info.expectedA).toBeCloseTo(0.4285, 4);
    expect(info.mov).toBeCloseTo(1, 10);
    for (const c of info.changes) {
      expect(Math.abs(c.delta)).toBeCloseTo(32 * (1 - 0.428537), 3);
      expect(c.delta > 0).toBe(c.team === "A");
    }
    expect(result.players.get("p1")!.doubles.rating).toBeCloseTo(1618.29, 2);
  });

  it("is zero-sum when every player shares the same K", () => {
    const matches = [
      doubles("m1", "2026-01-01T10:00:00Z", ["p1", "p2"], ["p3", "p4"], 11, 6),
      doubles("m2", "2026-01-01T10:20:00Z", ["p1", "p3"], ["p2", "p4"], 9, 11),
      doubles("m3", "2026-01-01T10:40:00Z", ["p1", "p4"], ["p2", "p3"], 11, 0),
    ];
    const result = computeRatings(starting, matches, fixed);
    const total = [...result.players.values()].reduce((s, p) => s + p.doubles.rating, 0);
    expect(total).toBeCloseTo(1600 + 1400 + 1550 + 1550, 8);
  });

  it("keeps singles and doubles ratings separate", () => {
    const singles: EloMatch = { ...doubles("s1", "2026-01-02T00:00:00Z", ["p1"], ["p2"], 11, 3), mode: "singles" };
    const result = computeRatings(starting, [singles], fixed);
    expect(result.players.get("p1")!.doubles.rating).toBe(1600);
    expect(result.players.get("p1")!.singles.rating).toBeGreaterThan(1500);
    expect(result.players.get("p2")!.singles.matches).toBe(1);
  });

  it("replays in playedAt order regardless of input order", () => {
    const m1 = doubles("m1", "2026-01-01T10:00:00Z", ["p1", "p2"], ["p3", "p4"], 11, 6);
    const m2 = doubles("m2", "2026-01-01T11:00:00Z", ["p1", "p3"], ["p2", "p4"], 3, 11);
    const forward = computeRatings(starting, [m1, m2], cfg);
    const backward = computeRatings(starting, [m2, m1], cfg);
    expect(backward.players.get("p1")!.doubles.rating).toBe(forward.players.get("p1")!.doubles.rating);
  });

  it("applies provisional K until the threshold, then established K", () => {
    const config = { ...cfg, provisionalMatches: 2, marginOfVictory: false };
    const matches = [1, 2, 3].map((n) =>
      doubles(`m${n}`, `2026-01-0${n}T00:00:00Z`, ["p1", "p2"], ["p3", "p4"], 11, 5),
    );
    const result = computeRatings(starting, matches, config);
    const ks = [...result.byMatch.values()].map((m) => m.changes[0].k);
    expect(ks).toEqual([config.kProvisional, config.kProvisional, config.kEstablished]);
  });

  it("tracks wins, losses, streaks and peak", () => {
    const matches = [
      doubles("m1", "2026-01-01T00:00:00Z", ["p1", "p2"], ["p3", "p4"], 11, 5),
      doubles("m2", "2026-01-02T00:00:00Z", ["p1", "p2"], ["p3", "p4"], 11, 7),
      doubles("m3", "2026-01-03T00:00:00Z", ["p1", "p2"], ["p3", "p4"], 4, 11),
    ];
    const p1 = computeRatings(starting, matches, cfg).players.get("p1")!.doubles;
    expect(p1).toMatchObject({ matches: 3, wins: 2, losses: 1, streak: -1, bestWinStreak: 2 });
    expect(p1.peak).toBeGreaterThan(p1.rating);
    expect(p1.history).toHaveLength(4);
  });

  it("gives unknown players the base rating and skips undecided matches", () => {
    const result = computeRatings(
      [],
      [
        doubles("m1", "2026-01-01T00:00:00Z", ["x1", "x2"], ["x3", "x4"], 11, 5),
        doubles("tie", "2026-01-01T01:00:00Z", ["x1", "x2"], ["x3", "x4"], 5, 5),
      ],
      cfg,
    );
    expect(result.byMatch.has("tie")).toBe(false);
    expect(result.players.get("x1")!.doubles.matches).toBe(1);
    expect(result.byMatch.get("m1")!.expectedA).toBe(0.5);
  });
});

describe("leaderboard", () => {
  it("ranks established players and lists provisional ones unranked", () => {
    const starting = ["a", "b", "c", "d"].map((id) => ({ id, singles: 1500, doubles: 1500 }));
    const matches: EloMatch[] = [];
    for (let i = 0; i < 6; i++) {
      matches.push(doubles(`m${i}`, `2026-02-0${i + 1}T00:00:00Z`, ["a", "b"], ["c", "d"], 11, 4 + (i % 3)));
    }
    const result = computeRatings(starting, matches, cfg);
    const rows = leaderboard(result, "doubles", ["a", "b", "c", "d", "e"], { ...cfg, minMatchesRanked: 5 });
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(rows[0].stats.rating).toBeGreaterThan(rows[3].stats.rating);
    expect(rows.find((r) => r.playerId === "e")).toBeUndefined();
  });
});
