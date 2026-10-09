import { describe, expect, it } from "vitest";
import { computeRatings, DEFAULT_ELO_CONFIG, type EloMatch } from "@/lib/elo";
import { biggestUpsets, headToHead, movers, opponentStats, partnerStats, ratingChangeSince, summarize, type StatMatch } from "./index";

const m = (id: string, day: number, a: string[], b: string[], winner: "A" | "B"): StatMatch => ({
  id,
  mode: a.length === 2 ? "doubles" : "singles",
  playedAt: `2026-03-${String(day).padStart(2, "0")}T10:00:00Z`,
  teamA: a,
  teamB: b,
  winner,
});

const matches = [
  m("m1", 1, ["dhruv", "tarang"], ["gaurav", "manoj"], "A"),
  m("m2", 2, ["dhruv", "manoj"], ["gaurav", "tarang"], "B"),
  m("m3", 3, ["dhruv", "tarang"], ["satyam", "sunny"], "A"),
  m("m4", 4, ["dhruv"], ["tarang"], "B"),
];

describe("partner and opponent records", () => {
  it("counts doubles partners only", () => {
    expect(partnerStats("dhruv", matches)).toEqual([
      { playerId: "tarang", played: 2, wins: 2 },
      { playerId: "manoj", played: 1, wins: 0 },
    ]);
  });

  it("counts every opponent, optionally by mode", () => {
    const opps = opponentStats("dhruv", matches);
    expect(opps.find((o) => o.playerId === "tarang")).toEqual({ playerId: "tarang", played: 2, wins: 0 });
    expect(opponentStats("dhruv", matches, "singles")).toEqual([{ playerId: "tarang", played: 1, wins: 0 }]);
  });

  it("splits head-to-head into against and together", () => {
    const h = headToHead("dhruv", "tarang", matches);
    expect(h.together).toMatchObject({ played: 2, wins: 2 });
    expect(h.against).toMatchObject({ played: 2, wins: 0, matchIds: ["m2", "m4"] });
  });
});

describe("rating-derived stats", () => {
  const starting = [
    { id: "strong1", singles: 1700, doubles: 1700 },
    { id: "strong2", singles: 1700, doubles: 1700 },
    { id: "weak1", singles: 1300, doubles: 1300 },
    { id: "weak2", singles: 1300, doubles: 1300 },
  ];
  const elo: EloMatch[] = [
    { id: "e1", mode: "doubles", playedAt: "2026-03-01T00:00:00Z", teamA: ["strong1", "strong2"], teamB: ["weak1", "weak2"], games: [{ a: 11, b: 3 }], pointsToWin: 11 },
    { id: "e2", mode: "doubles", playedAt: "2026-03-05T00:00:00Z", teamA: ["strong1", "strong2"], teamB: ["weak1", "weak2"], games: [{ a: 8, b: 11 }], pointsToWin: 11 },
  ];
  const ratings = computeRatings(starting, elo, DEFAULT_ELO_CONFIG);

  it("finds upsets by the winner's pre-match probability", () => {
    const upsets = biggestUpsets(ratings);
    expect(upsets).toHaveLength(1);
    expect(upsets[0].matchId).toBe("e2");
    expect(upsets[0].winnerExpected).toBeLessThan(0.15);
  });

  it("measures change since a date", () => {
    const sinceE2 = ratingChangeSince(ratings, "weak1", "doubles", "2026-03-04T00:00:00Z");
    expect(sinceE2).toBeCloseTo(ratings.byMatch.get("e2")!.changes.find((c) => c.playerId === "weak1")!.delta, 10);
    expect(ratingChangeSince(ratings, "weak1", "doubles", "2026-04-01T00:00:00Z")).toBe(0);
    const all = ratingChangeSince(ratings, "weak1", "doubles", "2026-01-01T00:00:00Z");
    expect(all).toBeCloseTo(ratings.players.get("weak1")!.doubles.rating - 1300, 10);
  });

  it("ranks movers and summarises a set of matches", () => {
    const rows = movers(ratings, ["strong1", "weak1"], "doubles", "2026-03-04T00:00:00Z");
    expect(rows[0].playerId).toBe("weak1");
    const summary = summarize(["e1", "e2"], ratings);
    expect(summary.find((l) => l.playerId === "weak1")).toMatchObject({ wins: 1, losses: 1 });
    expect(summary[0].delta).toBeGreaterThan(0);
  });
});
