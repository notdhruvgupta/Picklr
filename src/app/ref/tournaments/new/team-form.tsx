"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FormatFields, useRememberedFormat } from "@/components/format-fields";
import { Button, Card, ErrorNote, Field, SectionTitle, Segmented, Select, Toggle, cx } from "@/components/ui";
import { friendlyError } from "@/lib/data/actions";
import { playersByRating } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import * as fmt from "@/lib/format";
import { seededRandom } from "@/lib/random";
import type { ScoringSystem } from "@/lib/scoring";
import { check, supabase } from "@/lib/supabase";
import {
  MIN_TEAM_PLAYERS,
  defaultTeamName,
  formTeamsOfThree,
  playerCaps,
  teamMatchCount,
  teamRoundRobinMatches,
  teamSizes,
  type TeamFormation,
} from "@/lib/team-tournament";

const SUB_THRESHOLD = 10;

type Formation = TeamFormation | "fixed";

/** Team tournament ("Triple Team Tournament") settings and team building. */
export function TeamTournamentForm({ name, cycles, onCreated }: { name: string; cycles: number; onCreated: () => void }) {
  const router = useRouter();
  const { players, ratings, config } = useData();
  const [formation, setFormation] = useState<Formation>("balanced");
  const [selected, setSelected] = useState<string[]>([]);
  const [fixed, setFixed] = useState<string[][]>([[], []]);
  const [active, setActive] = useState(0);
  const [seed, setSeed] = useState(1);
  const [group, setGroup] = useRememberedFormat();
  const [finalScoring, setFinalScoring] = useState<ScoringSystem>("rally");
  const [finalPoints, setFinalPoints] = useState(21);
  const [finalWinBy, setFinalWinBy] = useState(2);
  const [rated, setRated] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rating = (id: string) => ratings.players.get(id)?.doubles.rating ?? config.baseRating;
  const playerName = (id: string) => players.get(id)?.name ?? "?";
  const list = playersByRating(players, ratings, "doubles");

  const teams: string[][] = useMemo(() => {
    if (formation === "fixed") return fixed.filter((t) => t.length > 0);
    if (selected.length < MIN_TEAM_PLAYERS) return [];
    return formTeamsOfThree(
      selected.map((id) => ({ id, rating: rating(id) })),
      formation,
      seededRandom(seed),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rating() reads ratings, listed
  }, [formation, selected, fixed, seed, ratings]);

  const avg = (ids: string[]) => ids.reduce((s, id) => s + rating(id), 0) / ids.length;
  // Seed strongest team first; list each team strongest first.
  const seeded = [...teams].map((t) => [...t].sort((x, y) => rating(y) - rating(x))).sort((x, y) => avg(y) - avg(x));
  const problem =
    formation === "fixed"
      ? seeded.length < 2
        ? "Make at least two teams."
        : seeded.some((t) => t.length < 3 || t.length > 4)
          ? "Each team needs 3 or 4 players."
          : null
      : selected.length < MIN_TEAM_PLAYERS
        ? `Pick at least ${MIN_TEAM_PLAYERS} players.`
        : null;
  const teamMatches = teamMatchCount(seeded.length, cycles);
  const capsLine = [...new Set(seeded.map((t) => t.length))]
    .sort()
    .map((size) => {
      const c = playerCaps(size, teamMatches);
      return `teams of ${size}: each player plays ${c.min === c.max ? c.max : `${c.min}–${c.max}`}`;
    })
    .join(" · ");

  const tap = (id: string) => {
    if (formation !== "fixed") {
      setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
      return;
    }
    // Fixed teams: tap adds to the active team, moves from another team, or removes.
    const current = fixed.findIndex((t) => t.includes(id));
    const next = fixed.map((t) => t.filter((x) => x !== id));
    if (current !== active) {
      if (next[active].length >= 4) return setError("A team has at most 4 players.");
      next[active] = [...next[active], id];
    }
    setError(null);
    setFixed(next);
  };

  const create = async () => {
    if (problem) return setError(problem);
    if (finalPoints <= SUB_THRESHOLD) return setError(`The final must be to more than ${SUB_THRESHOLD} points.`);
    setBusy(true);
    setError(null);
    try {
      const tournamentId = crypto.randomUUID();
      const entries = seeded.map((ids, i) => ({
        id: crypto.randomUUID(),
        tournament_id: tournamentId,
        seed: i + 1,
        name: defaultTeamName(ids.map(playerName)),
        player_ids: ids,
      }));
      const matches = teamRoundRobinMatches(
        {
          id: tournamentId,
          format: "team_round_robin",
          mode: "doubles",
          scoring: group.scoring,
          pointsToWin: group.pointsToWin,
          winBy: group.winBy,
          bestOf: group.bestOf,
          isRated: rated,
          cycles,
        },
        entries,
        () => crypto.randomUUID(),
      );
      check(
        await supabase.rpc("create_tournament", {
          p_tournament: {
            id: tournamentId,
            name,
            format: "team_round_robin",
            mode: "doubles",
            team_formation: formation,
            scoring: group.scoring,
            points_to_win: group.pointsToWin,
            win_by: group.winBy,
            best_of: group.bestOf,
            playoff_size: 2,
            round_robin_cycles: cycles,
            is_rated: rated,
            final_scoring: finalScoring,
            final_points_to_win: finalPoints,
            final_win_by: finalWinBy,
            sub_threshold: SUB_THRESHOLD,
          },
          p_entries: entries,
          p_matches: matches,
        }),
      );
      // This page stays alive (hidden) after navigating away; start the next one from a clean form.
      setSelected([]);
      setFixed([[], []]);
      setActive(0);
      setBusy(false);
      onCreated();
      router.push(`/tournaments/${tournamentId}`);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  const chosen = (id: string) => (formation === "fixed" ? fixed.findIndex((t) => t.includes(id)) : selected.includes(id) ? 0 : -1);

  return (
    <div className="space-y-6">
      <Card className="space-y-2 p-4 text-sm text-muted">
        <p>
          <span className="font-semibold text-text">How it works:</span> players are split into teams of 3 (4 when the numbers don&apos;t divide).
          Teams play a {cycles === 3 ? "triple" : "double"} round robin of doubles: each match, a team fields 2 of its players, and everyone plays a
          fair share. The top two teams meet in a final where, at {SUB_THRESHOLD} points, both teams bring on their bench player.
        </p>
      </Card>

      <Field label="Teams">
        <Select
          value={formation}
          onChange={(e) => {
            setFormation(e.target.value as Formation);
            setError(null);
          }}
        >
          <option value="balanced">Balanced: closest team averages</option>
          <option value="snake">Snake draft by rating</option>
          <option value="random">Random draw</option>
          <option value="fixed">Fixed: I&apos;ll pick the teams</option>
        </Select>
      </Field>

      {formation === "fixed" && (
        <div className="flex flex-wrap items-center gap-2">
          {fixed.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={active === i}
              className={cx(
                "rounded-full border-2 px-3 py-1 text-sm font-semibold",
                active === i ? "border-primary bg-primary/10" : "border-line text-muted",
              )}
            >
              Team {i + 1} · {t.length}
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFixed([...fixed, []]);
              setActive(fixed.length);
            }}
          >
            + Add team
          </Button>
        </div>
      )}

      <section>
        <SectionTitle
          action={
            formation === "random" && selected.length >= MIN_TEAM_PLAYERS ? (
              <Button variant="ghost" size="sm" onClick={() => setSeed((s) => s + 1)}>
                Redraw
              </Button>
            ) : undefined
          }
        >
          {formation === "fixed" ? `Tap players to add them to Team ${active + 1}` : `Players · ${selected.length} picked`}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {list.map((p) => {
            const team = chosen(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={team >= 0}
                onClick={() => tap(p.id)}
                className={cx(
                  "flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-left text-sm",
                  team >= 0 ? "border-primary bg-primary/10 font-semibold" : "border-line bg-surface text-muted hover:text-text",
                )}
              >
                <span className="truncate">{p.name}</span>
                <span className="tabular text-xs">{formation === "fixed" && team >= 0 ? `T${team + 1}` : fmt.rating(rating(p.id))}</span>
              </button>
            );
          })}
        </div>
        {formation !== "fixed" && selected.length >= MIN_TEAM_PLAYERS && (
          <p className="mt-2 text-xs text-muted">
            {selected.length} players → teams of {teamSizes(selected.length).join(", ")}
          </p>
        )}
      </section>

      {seeded.length >= 2 && !problem && (
        <section>
          <SectionTitle>Teams · {seeded.length}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {seeded.map((ids, i) => (
              <Card key={ids.join()} className="p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold">
                    #{i + 1} {defaultTeamName(ids.map(playerName))}
                  </span>
                  <span className="tabular text-xs text-muted">avg {fmt.rating(avg(ids))}</span>
                </div>
                <p className="text-sm text-muted">{ids.map(playerName).join(", ")}</p>
              </Card>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">
            {seeded.length * (seeded.length - 1) * cycles / 2} group matches + final. Each team plays {teamMatches}; {capsLine}.
          </p>
        </section>
      )}

      <section className="space-y-4">
        <SectionTitle>Group matches</SectionTitle>
        <FormatFields value={group} onChange={setGroup} />
      </section>

      <section className="space-y-4">
        <SectionTitle>Final</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Scoring">
            <Segmented
              label="Final scoring"
              className="w-full"
              value={finalScoring}
              onChange={setFinalScoring}
              options={[
                { value: "rally", label: "Rally" },
                { value: "sideout", label: "Side-out" },
              ]}
            />
          </Field>
          <Field label="Game to">
            <Select value={finalPoints} onChange={(e) => setFinalPoints(Number(e.target.value))}>
              {[15, 21, 25].map((n) => (
                <option key={n} value={n}>
                  {n} points
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Win by">
            <Segmented
              label="Final win by"
              className="w-full"
              value={String(finalWinBy) as "1" | "2"}
              onChange={(v) => setFinalWinBy(Number(v))}
              options={[
                { value: "2", label: "Win by 2" },
                { value: "1", label: "Win by 1" },
              ]}
            />
          </Field>
        </div>
        <p className="text-sm text-muted">
          Substitution at <span className="font-semibold text-text">{SUB_THRESHOLD}</span>: when the first team reaches {SUB_THRESHOLD}, both teams
          bring on their bench player, and that team picks who goes off on both sides. The final is rated in two parts, one per lineup.
        </p>
        <Toggle checked={rated} onChange={setRated} label="Rated" description="Group matches and the final count toward doubles Elo." />
      </section>

      <ErrorNote>{error}</ErrorNote>
      <Button size="lg" className="w-full" disabled={busy || !!problem} onClick={create}>
        {problem ?? "Create team tournament"}
      </Button>
    </div>
  );
}
