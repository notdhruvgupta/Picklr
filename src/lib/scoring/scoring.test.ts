import { describe, expect, it } from "vitest";
import type { Team } from "@/lib/elo";
import {
  applyEvent,
  initialState,
  onCourt,
  periodScores,
  replay,
  resultGames,
  scoreCall,
  validateFinalGames,
  type Lineup,
  type MatchFormat,
  type RallyEvent,
} from "./index";

const sideoutDoubles: MatchFormat = { mode: "doubles", scoring: "sideout", pointsToWin: 11, winBy: 2, bestOf: 1 };
const sideoutSingles: MatchFormat = { ...sideoutDoubles, mode: "singles" };
const rally21: MatchFormat = { mode: "doubles", scoring: "rally", pointsToWin: 21, winBy: 2, bestOf: 1 };

const rallies = (...winners: Team[]): RallyEvent[] => winners.map((winner) => ({ kind: "rally", winner }));

describe("side-out doubles", () => {
  it("starts at 0-0-2", () => {
    expect(scoreCall(initialState(sideoutDoubles), sideoutDoubles)).toBe("0-0-2");
  });

  it("only the serving team scores and sides out after the first server at 0-0-2", () => {
    let s = replay(sideoutDoubles, rallies("A", "A"));
    expect(s.current).toEqual({ a: 2, b: 0 });
    expect(scoreCall(s, sideoutDoubles)).toBe("2-0-2");

    // Receiving team wins: first server of the game is already server 2, so side out.
    s = applyEvent(s, { kind: "rally", winner: "B" }, sideoutDoubles);
    expect(s.servingTeam).toBe("B");
    expect(scoreCall(s, sideoutDoubles)).toBe("0-2-1");

    // B loses a rally on server 1 -> server 2, no point to A.
    s = applyEvent(s, { kind: "rally", winner: "A" }, sideoutDoubles);
    expect(scoreCall(s, sideoutDoubles)).toBe("0-2-2");
    expect(s.current).toEqual({ a: 2, b: 0 });

    // B scores on server 2.
    s = applyEvent(s, { kind: "rally", winner: "B" }, sideoutDoubles);
    expect(scoreCall(s, sideoutDoubles)).toBe("1-2-2");

    // B loses on server 2 -> side out to A server 1.
    s = applyEvent(s, { kind: "rally", winner: "A" }, sideoutDoubles);
    expect(s.servingTeam).toBe("A");
    expect(scoreCall(s, sideoutDoubles)).toBe("2-1-1");
  });

  it("ends the game at 11 with a 2-point lead and not before", () => {
    // A serves and wins 10 straight, then B sides out and scores to 10-10.
    const events: RallyEvent[] = [
      ...rallies(...Array<Team>(10).fill("A")),
      { kind: "correction", a: 10, b: 10, servingTeam: "A", serverNumber: 1 },
    ];
    let s = replay(sideoutDoubles, events);
    s = applyEvent(s, { kind: "rally", winner: "A" }, sideoutDoubles);
    expect(s.winner).toBeNull();
    expect(s.current).toEqual({ a: 11, b: 10 });
    s = applyEvent(s, { kind: "rally", winner: "A" }, sideoutDoubles);
    expect(s.winner).toBe("A");
    expect(s.notice).toBe("match-over");
    expect(resultGames(s)).toEqual([{ a: 12, b: 10 }]);
    expect(scoreCall(s, sideoutDoubles)).toBe("12-10");
  });

  it("flags switching ends at 6 in the deciding game", () => {
    const s = replay(sideoutDoubles, rallies("A", "A", "A", "A", "A", "A"));
    expect(s.notice).toBe("switch-ends");
  });

  it("ignores events after the match is over", () => {
    const done = replay(sideoutDoubles, rallies(...Array<Team>(11).fill("A")));
    expect(done.winner).toBe("A");
    expect(applyEvent(done, { kind: "rally", winner: "B" }, sideoutDoubles)).toBe(done);
  });
});

describe("side-out singles", () => {
  it("has a single server and sides out on any lost serve", () => {
    let s = initialState(sideoutSingles);
    expect(scoreCall(s, sideoutSingles)).toBe("0-0");
    s = applyEvent(s, { kind: "rally", winner: "B" }, sideoutSingles);
    expect(s.servingTeam).toBe("B");
    expect(s.current).toEqual({ a: 0, b: 0 });
  });
});

describe("rally scoring", () => {
  it("scores every rally and gives serve to the rally winner", () => {
    const s = replay(rally21, rallies("A", "B", "B"));
    expect(s.current).toEqual({ a: 1, b: 2 });
    expect(s.servingTeam).toBe("B");
    expect(scoreCall(s, rally21)).toBe("2-1");
  });

  it("plays to 21", () => {
    const s = replay(rally21, rallies(...Array<Team>(21).fill("B")));
    expect(s.winner).toBe("B");
    expect(s.games).toEqual([{ a: 0, b: 21 }]);
  });
});

describe("best of 3", () => {
  const bo3: MatchFormat = { ...rally21, pointsToWin: 11, bestOf: 3 };

  it("alternates first serve and needs two games", () => {
    let s = replay(bo3, rallies(...Array<Team>(11).fill("A")));
    expect(s.winner).toBeNull();
    expect(s.notice).toBe("game-over");
    expect(s.games).toEqual([{ a: 11, b: 0 }]);
    expect(s.servingTeam).toBe("B");
    s = replay(bo3, rallies(...Array<Team>(11).fill("A"), ...Array<Team>(11).fill("B"), ...Array<Team>(11).fill("A")));
    expect(s.winner).toBe("A");
    expect(s.games).toHaveLength(3);
  });
});

describe("validateFinalGames", () => {
  it("accepts valid results", () => {
    expect(validateFinalGames([{ a: 11, b: 7 }], sideoutDoubles)).toBeNull();
    expect(validateFinalGames([{ a: 13, b: 11 }], sideoutDoubles)).toBeNull();
  });

  it("rejects unfinished or impossible games", () => {
    expect(validateFinalGames([{ a: 10, b: 7 }], sideoutDoubles)).toMatch(/isn't a finished game/);
    expect(validateFinalGames([{ a: 11, b: 10 }], sideoutDoubles)).toMatch(/isn't a finished game/);
    expect(validateFinalGames([{ a: 14, b: 11 }], sideoutDoubles)).toMatch(/lead is 2/);
    expect(validateFinalGames([], sideoutDoubles)).toMatch(/at least one/);
  });

  it("checks best-of-3 consistency", () => {
    const bo3 = { ...sideoutDoubles, bestOf: 3 };
    expect(validateFinalGames([{ a: 11, b: 5 }], bo3)).toMatch(/No team/);
    expect(validateFinalGames([{ a: 11, b: 5 }, { a: 11, b: 5 }, { a: 5, b: 11 }], bo3)).toMatch(/already decided/);
    expect(validateFinalGames([{ a: 11, b: 5 }, { a: 5, b: 11 }, { a: 11, b: 9 }], bo3)).toBeNull();
  });
});

describe("team final substitution", () => {
  const final: MatchFormat = { mode: "doubles", scoring: "rally", pointsToWin: 21, winBy: 2, bestOf: 1, subThreshold: 10 };
  const start: Lineup = { A: ["gaurav", "tarang"], B: ["b1", "b2"] };
  const second: Lineup = { A: ["gaurav", "yatharth"], B: ["b2", "b3"] };
  const tenSeven: Team[] = [...Array<Team>(7).fill("B"), ...Array<Team>(10).fill("A")];

  it("tracks the starting lineup", () => {
    expect(onCourt(initialState(final, "A", start))).toEqual(start);
    expect(onCourt(initialState(final))).toBeNull();
  });

  it("stops play when the first team reaches 10 and remembers who got there", () => {
    const s = replay(final, rallies(...tenSeven), "A", start);
    expect(s.current).toEqual({ a: 10, b: 7 });
    expect(s.pendingSub).toBe("A");
    expect(s.notice).toBe("substitution");
    // Rallies are ignored until the substitution is made.
    expect(applyEvent(s, { kind: "rally", winner: "B" }, final)).toBe(s);
  });

  it("records the new lineup from the current score and plays on", () => {
    let s = replay(final, [...rallies(...tenSeven), { kind: "substitution", lineup: second }], "A", start);
    expect(s.pendingSub).toBeNull();
    expect(onCourt(s)).toEqual(second);
    expect(s.periods![1].from).toEqual({ a: 10, b: 7 });
    s = replay(final, [...rallies(...tenSeven), { kind: "substitution", lineup: second }, ...rallies(...Array<Team>(11).fill("A"))], "A", start);
    expect(s.winner).toBe("A");
    expect(periodScores(s.periods!, s.games[0])).toEqual([
      { lineup: start, a: 10, b: 7 },
      { lineup: second, a: 11, b: 0 },
    ]);
  });

  it("only substitutes once per game", () => {
    const s = replay(final, [...rallies(...tenSeven), { kind: "substitution", lineup: second }, ...rallies(...Array<Team>(5).fill("B"))], "A", start);
    expect(s.current).toEqual({ a: 10, b: 12 });
    expect(s.pendingSub).toBeNull();
    expect(applyEvent(s, { kind: "substitution", lineup: start }, final)).toBe(s);
  });

  it("undo before the substitution brings the pause back; a correction below 10 clears it", () => {
    const events: RallyEvent[] = [...rallies(...tenSeven), { kind: "substitution", lineup: second }];
    expect(replay(final, events.slice(0, -1), "A", start).pendingSub).toBe("A");
    const corrected = applyEvent(replay(final, rallies(...tenSeven), "A", start), { kind: "correction", a: 9, b: 7, servingTeam: "A", serverNumber: 1 }, final);
    expect(corrected.pendingSub).toBeNull();
  });

  it("ignores substitutions in ordinary matches", () => {
    const s = replay(rally21, rallies(...Array<Team>(10).fill("A")));
    expect(s.pendingSub).toBeUndefined();
    expect(applyEvent(s, { kind: "substitution", lineup: second }, rally21)).toBe(s);
  });
});
