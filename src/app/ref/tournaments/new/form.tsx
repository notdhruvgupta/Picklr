"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TeamNames } from "@/components/bits";
import { FormatFields, useRememberedFormat } from "@/components/format-fields";
import { Button, Card, ErrorNote, Field, Input, PageTitle, SectionTitle, Segmented, Select, Toggle, cx } from "@/components/ui";
import { friendlyError } from "@/lib/data/actions";
import { playersByRating } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import type { Mode } from "@/lib/elo";
import * as fmt from "@/lib/format";
import { formTeams } from "@/lib/matchmaking";
import { seededRandom } from "@/lib/random";
import { check, supabase } from "@/lib/supabase";
import { buildTournamentMatches, formatName, type EntrySpec } from "@/lib/tournament";
import type { TeamFormationChoice, TournamentFormat } from "@/lib/types";

const defaultName = () => `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date())} tournament`;

export function NewTournament() {
  const router = useRouter();
  const { players, ratings, config } = useData();
  const [name, setName] = useState(defaultName);
  const [format, setFormat] = useState<TournamentFormat>("round_robin");
  const [mode, setMode] = useState<Mode>("doubles");
  const [formation, setFormation] = useState<TeamFormationChoice>("balanced");
  const [selected, setSelected] = useState<string[]>([]);
  const [fixedTeams, setFixedTeams] = useState<string[][]>([]);
  const [playoff, setPlayoff] = useState(0);
  const [rated, setRated] = useState(true);
  const [scoring, setScoring] = useRememberedFormat();
  const [seed, setSeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rating = (id: string) => ratings.players.get(id)?.[mode].rating ?? config.baseRating;
  const list = playersByRating(players, ratings, mode);

  const toggle = (id: string) => {
    if (mode === "doubles" && formation === "fixed") {
      // Build pairs in tap order: the first unpaired tap starts a team, the next completes it.
      const inTeam = fixedTeams.findIndex((t) => t.includes(id));
      if (inTeam >= 0) {
        setFixedTeams(fixedTeams.filter((_, i) => i !== inTeam));
        return;
      }
      const open = fixedTeams.findIndex((t) => t.length === 1);
      setFixedTeams(open >= 0 ? fixedTeams.map((t, i) => (i === open ? [...t, id] : t)) : [...fixedTeams, [id]]);
      return;
    }
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const { teams, leftover } = useMemo(() => {
    if (mode === "singles") return { teams: selected.map((id) => [id]), leftover: [] as string[] };
    if (formation === "fixed") return { teams: fixedTeams.filter((t) => t.length === 2), leftover: fixedTeams.filter((t) => t.length === 1).flat() };
    const out = formTeams(selected.map((id) => ({ id, rating: rating(id) })), formation, seededRandom(seed));
    return { teams: out.teams as string[][], leftover: out.leftover };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rating() reads ratings/mode, both listed
  }, [mode, formation, selected, fixedTeams, seed, ratings]);

  // Seed by (average) rating, best first.
  const seeded = [...teams].sort((a, b) => b.reduce((s, id) => s + rating(id), 0) / b.length - a.reduce((s, id) => s + rating(id), 0) / a.length);
  const preview = seeded.length >= 2
    ? buildTournamentMatches(
        { id: "preview", format, mode, scoring: scoring.scoring, pointsToWin: scoring.pointsToWin, winBy: scoring.winBy, bestOf: scoring.bestOf, isRated: rated },
        seeded.map((ids, i) => ({ id: `e${i}`, seed: i + 1, playerIds: ids })),
        (() => {
          let n = 0;
          return () => `p${n++}`;
        })(),
      )
    : [];
  const playoffMatchCount = format === "round_robin" && playoff ? playoff - 1 : 0;
  const isChosen = (id: string) => (mode === "doubles" && formation === "fixed" ? fixedTeams.some((t) => t.includes(id)) : selected.includes(id));

  const create = async () => {
    if (seeded.length < 2) return setError("A tournament needs at least two entries.");
    if (format === "round_robin" && playoff > seeded.length) return setError(`A top-${playoff} playoff needs at least ${playoff} entries.`);
    setBusy(true);
    setError(null);
    try {
      const tournamentId = crypto.randomUUID();
      const entries: EntrySpec[] = seeded.map((ids, i) => ({ id: crypto.randomUUID(), seed: i + 1, playerIds: ids }));
      const matches = buildTournamentMatches(
        { id: tournamentId, format, mode, scoring: scoring.scoring, pointsToWin: scoring.pointsToWin, winBy: scoring.winBy, bestOf: scoring.bestOf, isRated: rated },
        entries,
        () => crypto.randomUUID(),
      );
      check(
        await supabase.rpc("create_tournament", {
          p_tournament: {
            id: tournamentId,
            name: name.trim() || defaultName(),
            format,
            mode,
            team_formation: mode === "doubles" ? formation : null,
            scoring: scoring.scoring,
            points_to_win: scoring.pointsToWin,
            win_by: scoring.winBy,
            best_of: scoring.bestOf,
            playoff_size: format === "round_robin" ? playoff : 0,
            is_rated: rated,
          },
          p_entries: entries.map((e) => ({ id: e.id, tournament_id: tournamentId, seed: e.seed, name: null, player_ids: e.playerIds })),
          p_matches: matches,
        }),
      );
      router.push(`/tournaments/${tournamentId}`);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Entries are seeded by current Elo, so the strongest meet last.">New tournament</PageTitle>

      <Field label="Name" htmlFor="t-name">
        <Input id="t-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Format">
          <Select value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)}>
            <option value="round_robin">Round robin (everyone plays everyone)</option>
            <option value="single_elim">Single elimination</option>
            <option value="double_elim">Double elimination</option>
          </Select>
        </Field>
        <Field label="Type">
          <Segmented
            label="Tournament type"
            className="w-full"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setFixedTeams([]);
            }}
            options={[
              { value: "doubles", label: "Doubles" },
              { value: "singles", label: "Singles" },
            ]}
          />
        </Field>
        {format === "round_robin" && (
          <Field label="Playoffs after the round robin">
            <Select value={playoff} onChange={(e) => setPlayoff(Number(e.target.value))}>
              <option value={0}>None: top of the table wins</option>
              <option value={2}>Final between the top 2</option>
              <option value={4}>Semis + final for the top 4</option>
            </Select>
          </Field>
        )}
        {mode === "doubles" && (
          <Field label="Teams">
            <Select
              value={formation}
              onChange={(e) => {
                setFormation(e.target.value as TeamFormationChoice);
                setFixedTeams([]);
              }}
            >
              <option value="balanced">Balanced: closest team averages</option>
              <option value="snake">Snake: best with worst</option>
              <option value="random">Random draw</option>
              <option value="fixed">Fixed: I&apos;ll pick the pairs</option>
            </Select>
          </Field>
        )}
      </div>

      <section>
        <SectionTitle
          action={
            mode === "doubles" && formation === "random" && selected.length >= 4 ? (
              <Button variant="ghost" size="sm" onClick={() => setSeed((s) => s + 1)}>
                Redraw
              </Button>
            ) : undefined
          }
        >
          {mode === "doubles" && formation === "fixed" ? "Tap two players to pair them" : "Players"}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={isChosen(p.id)}
              onClick={() => toggle(p.id)}
              className={cx(
                "flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-left text-sm",
                isChosen(p.id) ? "border-primary bg-primary/10 font-semibold" : "border-line bg-surface text-muted hover:text-text",
              )}
            >
              <span className="truncate">{p.name}</span>
              <span className="tabular text-xs">{fmt.rating(rating(p.id))}</span>
            </button>
          ))}
        </div>
      </section>

      {seeded.length > 0 && (
        <section>
          <SectionTitle>Seeds · {seeded.length} entries</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {seeded.map((ids, i) => (
              <div key={ids.join()} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="tabular w-6 font-bold text-muted">#{i + 1}</span>
                <span className="flex-1">
                  <TeamNames ids={ids} link={false} />
                </span>
                <span className="tabular text-muted">{fmt.rating(ids.reduce((s, id) => s + rating(id), 0) / ids.length)}</span>
              </div>
            ))}
          </Card>
          {leftover.length > 0 && (
            <p className="mt-2 text-sm text-loss">
              <TeamNames list ids={leftover} link={false} /> {formation === "fixed" ? "needs a partner." : "has no partner (odd number of players) and will sit out."}
            </p>
          )}
          <p className="mt-2 text-sm text-muted">
            {formatName(format)}: {preview.filter((m) => !m.is_conditional).length + playoffMatchCount} matches
            {format === "double_elim" ? " (+1 if the grand final needs a reset)" : ""}.
          </p>
        </section>
      )}

      <section className="space-y-4">
        <SectionTitle>Match format</SectionTitle>
        <FormatFields value={scoring} onChange={setScoring} />
        <Toggle checked={rated} onChange={setRated} label="Rated" description="Tournament matches count toward Elo like any other match." />
      </section>

      <ErrorNote>{error}</ErrorNote>
      <Button size="lg" className="w-full" disabled={busy || seeded.length < 2} onClick={create}>
        Create tournament
      </Button>
    </div>
  );
}
