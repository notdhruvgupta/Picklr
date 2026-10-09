import { describe, expect, it } from "vitest";
import { buildTournamentMatches, playoffMatches, type EntrySpec, type TournamentSpec } from "./tournament";

const spec = (format: TournamentSpec["format"]): TournamentSpec => ({
  id: "t1",
  format,
  mode: "doubles",
  scoring: "sideout",
  pointsToWin: 11,
  winBy: 2,
  bestOf: 1,
  isRated: true,
});

const entries = (n: number): EntrySpec[] =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, seed: i + 1, playerIds: [`p${2 * i + 1}`, `p${2 * i + 2}`] }));

const ids = () => {
  let n = 0;
  return () => `m${++n}`;
};

describe("buildTournamentMatches", () => {
  it("round robin: every pair once with entries and players filled in", () => {
    const rows = buildTournamentMatches(spec("round_robin"), entries(5), ids());
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.entry_a_id && r.entry_b_id && r.team_a.length === 2 && r.team_b.length === 2)).toBe(true);
    expect(rows.map((r) => r.queue_position)).toEqual(rows.map((_, i) => i + 1));
  });

  it("double and triple round robins repeat every pairing, labelled by leg", () => {
    for (const cycles of [2, 3]) {
      const rows = buildTournamentMatches({ ...spec("round_robin"), cycles }, entries(4), ids());
      expect(rows).toHaveLength(6 * cycles);
      const pairs = new Map<string, number>();
      for (const r of rows) {
        const k = [r.entry_a_id, r.entry_b_id].sort().join("|");
        pairs.set(k, (pairs.get(k) ?? 0) + 1);
      }
      expect([...pairs.values()].every((n) => n === cycles)).toBe(true);
      expect(rows[0].bracket_label).toBe("Leg 1 · Round 1");
      expect(rows[rows.length - 1].bracket_label).toBe(`Leg ${cycles} · Round 3`);
      expect(rows[rows.length - 1].bracket_round).toBe(3 * cycles);
    }
  });

  it("single elimination wires winners forward and fills only the first-round slots", () => {
    const rows = buildTournamentMatches(spec("single_elim"), entries(5), ids());
    expect(rows).toHaveLength(4);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const final = rows.find((r) => r.bracket_label === "Final")!;
    expect(final.winner_to).toBeNull();
    for (const r of rows) {
      if (r.winner_to) expect(byId.has(r.winner_to)).toBe(true);
    }
    // 4v5 plays first; seeds 1-3 wait in later rounds.
    expect(rows[0].team_a.length + rows[0].team_b.length).toBe(4);
  });

  it("double elimination orders matches so every dependency comes first", () => {
    const rows = buildTournamentMatches(spec("double_elim"), entries(6), ids());
    const position = new Map(rows.map((r) => [r.id, r.queue_position]));
    for (const r of rows) {
      for (const target of [r.winner_to, r.loser_to]) {
        if (target) expect(position.get(target)!).toBeGreaterThan(r.queue_position);
      }
    }
    expect(rows.filter((r) => r.is_conditional)).toHaveLength(1);
  });
});

describe("playoffMatches", () => {
  it("seeds the top finishers into a knockout with prefixed keys", () => {
    const finishers = entries(5).reverse(); // finishing order differs from original seeds
    const rows = playoffMatches(spec("round_robin"), finishers, 4, ids(), 10);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.stage === "playoff" && r.bracket_key!.startsWith("P-"))).toBe(true);
    expect(rows[0].queue_position).toBe(11);
    // Semifinal 1 is 1st place vs 4th place.
    const semi1 = rows.find((r) => r.bracket_label === "Semifinal 1")!;
    expect([semi1.entry_a_id, semi1.entry_b_id]).toEqual(["e5", "e2"]);
  });
});
