"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Delta, TeamNames } from "@/components/bits";
import { FormatFields, useRememberedFormat } from "@/components/format-fields";
import { GamesInput, filledGames } from "@/components/games-input";
import { WinChanceBar } from "@/components/match";
import { TeamPicker, teamsFrom, type Assignment } from "@/components/team-picker";
import { Button, Card, ErrorNote, PageTitle, SectionTitle, Segmented, Toggle, cx } from "@/components/ui";
import { completeMatch, createMatch, deleteMatch, friendlyError } from "@/lib/data/actions";
import { teamLabel } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import { previewMatch, type GameResult, type Mode } from "@/lib/elo";
import * as fmt from "@/lib/format";
import { pairingOptions } from "@/lib/matchmaking";
import { validateFinalGames, type MatchFormat } from "@/lib/scoring";

export function NewMatchForm() {
  const router = useRouter();
  const { players, ratings, config, sessions, matches } = useData();
  const [mode, setMode] = useState<Mode>("doubles");
  const [assignment, setAssignment] = useState<Assignment>({});
  const [format, setFormat] = useRememberedFormat();
  const [rated, setRated] = useState(true);
  const [quick, setQuick] = useState(false);
  const [games, setGames] = useState<(GameResult | null)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const perTeam = mode === "doubles" ? 2 : 1;
  const { teamA, teamB } = teamsFrom(assignment);
  const ready = teamA.length === perTeam && teamB.length === perTeam;
  const openSession = [...sessions.values()].find((s) => s.status === "open" && s.mode === mode);
  const matchFormat: MatchFormat = { mode, ...format };

  const stats = (id: string) => ratings.players.get(id)?.[mode] ?? { rating: config.baseRating, matches: 0 };
  const preview = ready ? previewMatch(teamA.map(stats), teamB.map(stats), config) : null;
  const chosen = Object.keys(assignment);
  const options =
    mode === "doubles" && chosen.length === 4
      ? pairingOptions(chosen.map((id) => ({ id, rating: stats(id).rating })))
      : [];
  const sameTeams = (o: { teamA: string[]; teamB: string[] }) =>
    [o.teamA, o.teamB].some((t) => t.every((id) => teamA.includes(id)) && t.length === teamA.length);

  const switchMode = (m: Mode) => {
    setMode(m);
    setAssignment({});
  };

  // "Start scoring" also creates a scheduled match; the scoring pad asks who serves first, then starts it.
  const create = async (then: "score" | "queue") => {
    setBusy(true);
    setError(null);
    try {
      const queueTail = Math.max(0, ...[...matches.values()].filter((m) => m.status === "scheduled").map((m) => m.queue_position ?? 0));
      const match = await createMatch({
        mode,
        format: matchFormat,
        teamA,
        teamB,
        isRated: rated,
        sessionId: openSession?.id ?? null,
        queuePosition: then === "queue" ? queueTail + 1 : null,
      });
      router.push(then === "score" ? `/ref/score/${match.id}` : "/ref");
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  const saveResult = async () => {
    const filled = filledGames(games);
    if (!filled) return setError("Fill in both scores for every game played.");
    const problem = validateFinalGames(filled, matchFormat);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    let createdId: string | null = null;
    try {
      const match = await createMatch({ mode, format: matchFormat, teamA, teamB, isRated: rated, sessionId: openSession?.id ?? null });
      createdId = match.id;
      await completeMatch(match.id, filled);
      router.push(`/matches/${match.id}`);
    } catch (err) {
      // Don't leave a half-created match behind.
      if (createdId) await deleteMatch(createdId).catch(() => {});
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle subtitle={openSession ? "This match will be added to today's session." : undefined}>New match</PageTitle>

      <Segmented
        label="Match type"
        value={mode}
        onChange={switchMode}
        options={[
          { value: "doubles", label: "Doubles" },
          { value: "singles", label: "Singles" },
        ]}
      />

      <section>
        <SectionTitle
          action={
            chosen.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setAssignment({})}>
                Clear
              </Button>
            )
          }
        >
          Players · tap once for A, twice for B
        </SectionTitle>
        <TeamPicker mode={mode} value={assignment} onChange={setAssignment} only={openSession?.present_player_ids.length ? openSession.present_player_ids : undefined} />
      </section>

      {options.length > 0 && (
        <section>
          <SectionTitle>Fair teams</SectionTitle>
          <div className="grid gap-2">
            {options.map((o, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setAssignment(Object.fromEntries([...o.teamA.map((id) => [id, "A"]), ...o.teamB.map((id) => [id, "B"])]))}
                className={cx(
                  "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm",
                  sameTeams(o) ? "border-primary bg-primary/5" : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                <span className="min-w-0 flex-1">
                  <TeamNames ids={o.teamA} link={false} /> <span className="text-muted">vs</span> <TeamNames ids={o.teamB} link={false} />
                </span>
                <span className="tabular font-semibold">
                  {fmt.percent(o.expectedA)}–{fmt.percent(1 - o.expectedA)}
                </span>
                {i === 0 && <span className="text-xs font-semibold text-primary">Fairest</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {preview && (
        <Card className="space-y-2 p-4">
          <WinChanceBar chance={preview.expectedA} />
          <p className="text-xs text-muted">
            At stake: <TeamNames ids={teamA} link={false} /> <Delta value={preview.ifAWins[0]} /> if they win,{" "}
            <TeamNames ids={teamB} link={false} /> <Delta value={preview.ifBWins[0]} /> if they win (each, at a typical margin).
          </p>
        </Card>
      )}

      <section className="space-y-4">
        <SectionTitle>Format</SectionTitle>
        <FormatFields value={format} onChange={setFormat} />
        <Toggle checked={rated} onChange={setRated} label="Rated match" description="Unrated matches are recorded but don't change ratings." />
      </section>

      {quick && ready && (
        <section className="space-y-3">
          <SectionTitle>Final score</SectionTitle>
          <GamesInput
            games={games}
            bestOf={format.bestOf}
            onChange={setGames}
            teamALabel={teamLabel(players, teamA)}
            teamBLabel={teamLabel(players, teamB)}
          />
        </section>
      )}

      <ErrorNote>{error}</ErrorNote>

      <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur sm:flex-row md:bottom-4">
        {quick ? (
          <>
            <Button size="lg" className="flex-1" disabled={!ready || busy} onClick={saveResult}>
              Save result
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setQuick(false)}>
              Back
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" className="flex-1" disabled={!ready || busy} onClick={() => create("score")}>
              Start scoring
            </Button>
            <Button variant="secondary" size="lg" disabled={!ready || busy} onClick={() => create("queue")}>
              Add to queue
            </Button>
            <Button variant="secondary" size="lg" disabled={!ready || busy} onClick={() => setQuick(true)}>
              Enter final score
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
