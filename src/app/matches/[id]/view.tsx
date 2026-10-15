"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Delta, TeamNames } from "@/components/bits";
import { useConfirm } from "@/components/confirm";
import { HandOver, NotYours, RunBy } from "@/components/ownership";
import { GamesInput, filledGames } from "@/components/games-input";
import { TvIcon } from "@/components/icons";
import { WhenReady } from "@/components/loading";
import { Scoreboard, WinChanceBar, formatLabel, formatOf, useWinChance } from "@/components/match";
import { TeamPicker, teamsFrom, type Assignment } from "@/components/team-picker";
import { FinalResultForm, LineupPicker, isTeamTournament } from "@/components/team";
import { Badge, Button, ButtonLink, Card, Empty, ErrorNote, LiveBadge, SectionTitle } from "@/components/ui";
import { completeMatch, deleteMatch, friendlyError, setMatchPlayers, updateMatch } from "@/lib/data/actions";
import { useOwnership } from "@/lib/data/ownership";
import { matchTime, teamLabel } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import type { GameResult } from "@/lib/elo";
import * as fmt from "@/lib/format";
import { validateFinalGames } from "@/lib/scoring";
import type { Match } from "@/lib/types";

function StatusBadge({ match }: { match: Match }) {
  if (match.status === "live") return <LiveBadge />;
  if (match.status === "completed") return <Badge tone="primary">Final</Badge>;
  if (match.status === "void") return <Badge tone="loss">{match.tournament_id ? "Not played" : "Archived"}</Badge>;
  return <Badge>Scheduled</Badge>;
}

function EloBreakdown({ match }: { match: Match }) {
  const { ratings, players, config } = useData();
  const info = ratings.byMatch.get(match.id);
  if (!info) return null;
  const winnerExpected = info.winner === "A" ? info.expectedA : 1 - info.expectedA;
  const names = (ids: string[]) => ids.map((id) => players.get(id)?.name ?? "?").join(" & ");
  return (
    <section>
      <SectionTitle>Rating changes</SectionTitle>
      <Card className="overflow-hidden">
        {info.segments ? (
          <div className="space-y-2 border-b border-line px-4 py-3 text-sm text-muted">
            <p>Rated in two parts, one per lineup, each weighted by its share of the points:</p>
            <ol className="space-y-1">
              {info.segments.map((seg, i) => (
                <li key={i}>
                  <span className="font-semibold text-text">
                    {i === 0 ? "Before" : "After"} the substitution ({Math.round(seg.weight * 100)}%):
                  </span>{" "}
                  {names(seg.teamA)} {seg.pointsA}–{seg.pointsB} {names(seg.teamB)}
                  {seg.pointsA === seg.pointsB ? " · a draw" : ""} · {fmt.percent(seg.pointsA >= seg.pointsB ? seg.expectedA : 1 - seg.expectedA)}{" "}
                  {seg.pointsA === seg.pointsB ? "for team A" : "chance for the side that won it"}
                </li>
              ))}
            </ol>
          </div>
        ) : (
        <p className="border-b border-line px-4 py-3 text-sm text-muted">
          The winners had a <span className="font-semibold text-text">{fmt.percent(winnerExpected)}</span> chance going in
          {config.marginOfVictory && (
            <>
              {" "}
              and the margin multiplier was <span className="font-semibold text-text">×{info.mov.toFixed(2)}</span>
            </>
          )}
          .{" "}
          <Link href="/about" className="font-semibold text-primary hover:underline">
            How this works
          </Link>
        </p>
        )}
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Player</th>
              <th className="px-2 py-2 text-right font-medium">Before</th>
              <th className="px-2 py-2 text-right font-medium">Change</th>
              <th className="px-4 py-2 text-right font-medium">After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {info.changes.map((c) => (
              <tr key={c.playerId}>
                <td className="px-4 py-2.5">
                  <Link href={`/players/${c.playerId}`} className="font-medium hover:underline">
                    {players.get(c.playerId)?.name}
                  </Link>
                  <span className="ml-2 text-xs text-muted">K{c.k}</span>
                </td>
                <td className="tabular px-2 py-2.5 text-right text-muted">{fmt.rating(c.before)}</td>
                <td className="px-2 py-2.5 text-right">
                  <Delta value={c.delta} />
                </td>
                <td className="tabular px-4 py-2.5 text-right font-semibold">{fmt.rating(c.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function RefereePanel({ match }: { match: Match }) {
  const router = useRouter();
  const { players } = useData();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [games, setGames] = useState<(GameResult | null)[]>(match.games);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const filled = filledGames(games);
      if (!filled) throw new Error("Fill in both scores for every game played.");
      const problem = validateFinalGames(filled, formatOf(match));
      if (problem) throw new Error(problem);
      await completeMatch(match.id, filled);
      setEditing(false);
    });

  const inTournament = match.tournament_id !== null;
  const { tournaments } = useData();
  const teamMatch = isTeamTournament(match.tournament_id ? tournaments.get(match.tournament_id) : undefined);
  const isFinal = !!match.sub_threshold;
  const hasLineups = match.team_a.length > 0 && match.team_b.length > 0;

  return (
    <Card className="space-y-4 border-ball/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Referee</h2>
        <Badge tone="ball">Only you see this</Badge>
      </div>

      {(match.status === "scheduled" || match.status === "live") && (
        <ButtonLink href={`/ref/score/${match.id}`} size="lg" className="w-full">
          {match.status === "live" ? "Continue scoring" : teamMatch && !hasLineups ? "Pick lineups" : "Start scoring"}
        </ButtonLink>
      )}

      {isFinal ? (
        editing ? (
          <FinalResultForm match={match} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
        ) : (
          match.status === "scheduled" &&
          hasLineups && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Or enter the result
            </Button>
          )
        )
      ) : editing || (match.status === "scheduled" && hasLineups) ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">{match.status === "completed" ? "Correct the result:" : "Or enter the final score:"}</p>
          <GamesInput
            games={games}
            bestOf={match.best_of}
            onChange={setGames}
            teamALabel={teamLabel(players, match.team_a)}
            teamBLabel={teamLabel(players, match.team_b)}
          />
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>
              Save result
            </Button>
            {editing && (
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {match.status === "completed" && !editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit result
          </Button>
        )}
        {match.status !== "void" && hasLineups && (!isFinal || match.status === "scheduled") && (
          <ButtonLink href={`/matches/${match.id}?edit=players`} replace scroll={false} variant="secondary" size="sm">
            {teamMatch ? "Change lineups" : "Change players"}
          </ButtonLink>
        )}
        {match.status === "completed" && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => updateMatch(match.id, { is_rated: !match.is_rated }))}>
            {match.is_rated ? "Make unrated" : "Make rated"}
          </Button>
        )}
        {match.status === "completed" && !inTournament && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm({
                title: "Archive this match?",
                body: "It's hidden from match lists and stops counting toward ratings. You can restore it any time from Matches → Archived.",
                confirmLabel: "Archive",
              });
              if (ok) await run(() => updateMatch(match.id, { status: "void" }));
            }}
          >
            Archive
          </Button>
        )}
        {match.status === "void" && !inTournament && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => run(() => updateMatch(match.id, { status: match.winner ? "completed" : "scheduled" }))}
          >
            Restore
          </Button>
        )}
        {!inTournament && (
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm({
                title: "Delete this match permanently?",
                body:
                  match.status === "live"
                    ? "It's being played right now. The score so far is thrown away and can't be recovered."
                    : match.status === "completed"
                      ? "The result is removed for good and every rating is recalculated without it. To keep it on record instead, archive it."
                      : "It's removed from the queue for good.",
                confirmLabel: "Delete match",
                danger: true,
              });
              if (!ok) return;
              await run(async () => {
                await deleteMatch(match.id);
                router.push("/matches");
              });
            }}
          >
            Delete
          </Button>
        )}
      </div>
      {!inTournament && !match.session_id && <HandOver kind="match" id={match.id} owner={match.created_by} />}
      {inTournament && (
        <p className="text-xs text-muted">
          Tournament matches can be corrected but not archived or deleted, so the bracket stays consistent. To stop a tournament, cancel it from its page.
        </p>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}

const sameSet = (x: string[], y: string[]) => x.length === y.length && x.every((id) => y.includes(id));

/** Fix who played, e.g. when the wrong player was picked. */
function ChangePlayers({ match }: { match: Match }) {
  const router = useRouter();
  const { matches, tournaments } = useData();
  const confirm = useConfirm();
  const [assignment, setAssignment] = useState<Assignment>(() =>
    Object.fromEntries([...match.team_a.map((id) => [id, "A"]), ...match.team_b.map((id) => [id, "B"])]),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  // On phones the editor opens below the fold; bring it into view.
  // (Block body: newer browsers return a Promise from scrollIntoView, and an effect must return nothing.)
  useEffect(() => {
    card.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const { teamA, teamB } = teamsFrom(assignment);
  const perTeam = match.mode === "doubles" ? 2 : 1;
  const complete = teamA.length === perTeam && teamB.length === perTeam;
  const unchanged = sameSet(teamA, match.team_a) && sameSet(teamB, match.team_b);
  const tournament = match.tournament_id ? tournaments.get(match.tournament_id) : undefined;
  const entryIds = [match.entry_a_id, match.entry_b_id].filter(Boolean);
  const affected = tournament
    ? [...matches.values()].filter(
        (m) => m.tournament_id === tournament.id && (entryIds.includes(m.entry_a_id) || entryIds.includes(m.entry_b_id)),
      ).length
    : 1;
  const close = () => router.replace(`/matches/${match.id}`, { scroll: false });

  const save = async () => {
    if (tournament && affected > 1) {
      const ok = await confirm({
        title: "Change this team across the tournament?",
        body: `In ${tournament.name} a team plays several matches, so this updates ${affected} matches, not just this one.`,
        confirmLabel: "Change players",
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      await setMatchPlayers(match.id, teamA, teamB);
      close();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card ref={card} className="scroll-mt-20 space-y-4 border-primary/50 p-4">
      <div>
        <h2 className="font-semibold">Change players</h2>
        <p className="text-sm text-muted">
          Tap once for team A, twice for team B, again to remove.
          {match.status === "completed" && match.is_rated && " Ratings are recalculated with the right players."}
          {tournament && affected > 1 && ` This changes the team in all ${affected} of its ${tournament.name} matches.`}
        </p>
      </div>
      <TeamPicker mode={match.mode} value={assignment} onChange={setAssignment} include={[...match.team_a, ...match.team_b]} />
      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={!complete || unchanged || busy}>
          {busy ? "Saving…" : "Save players"}
        </Button>
        <Button variant="ghost" onClick={close} disabled={busy}>
          Cancel
        </Button>
        {!complete && <span className="self-center text-xs text-muted">Each team needs {perTeam} player{perTeam > 1 ? "s" : ""}.</span>}
      </div>
    </Card>
  );
}

function MatchDetail({ id }: { id: string }) {
  const { matches, tournaments } = useData();
  const { canEdit } = useOwnership();
  const router = useRouter();
  // Open state lives in the URL: the referee panel remounts on every score update,
  // and Next keeps this page alive between visits, so component state would go stale.
  const changingPlayers = useSearchParams().get("edit") === "players";
  const match = matches.get(id);
  const chance = useWinChance(match ?? ({ team_a: [], team_b: [] } as unknown as Match));

  if (!match) {
    return (
      <Empty title="Match not found" action={<ButtonLink href="/matches" variant="secondary">All matches</ButtonLink>}>
        It may have been deleted.
      </Empty>
    );
  }
  const tournament = match.tournament_id ? tournaments.get(match.tournament_id) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge match={match} />
        <span className="text-sm text-muted">{formatLabel(match)}</span>
        <RunBy owner={match.created_by} className="text-sm text-muted" />
        {!match.is_rated && <Badge>Unrated</Badge>}
        <span className="text-sm text-muted">· {fmt.day(matchTime(match))}, {fmt.time(matchTime(match))}</span>
        {match.status === "live" && (
          <ButtonLink href={`/matches/${match.id}/tv`} variant="secondary" size="sm" className="ml-auto">
            <TvIcon className="size-4" /> TV mode
          </ButtonLink>
        )}
      </div>

      {tournament && (
        <Link href={`/tournaments/${tournament.id}`} className="block text-sm font-semibold text-primary hover:underline">
          {tournament.name}
          {match.bracket_label ? ` · ${match.bracket_label}` : ""}
        </Link>
      )}

      <h1 className="sr-only">
        <TeamNames ids={match.team_a} link={false} /> vs <TeamNames ids={match.team_b} link={false} />
      </h1>

      <Card className="p-3 sm:p-4">
        <Scoreboard match={match} />
        {chance !== null && match.status !== "void" && <WinChanceBar chance={chance} className="mt-4 px-1" />}
      </Card>

      {canEdit(match.created_by) ? (
        <>
          <RefereePanel key={`${match.id}-${match.updated_at}`} match={match} />
          {changingPlayers &&
            match.status !== "void" &&
            (isTeamTournament(match.tournament_id ? tournaments.get(match.tournament_id) : undefined) ? (
              (!match.sub_threshold || match.status === "scheduled") && (
                <Card className="p-4">
                  <LineupPicker
                    match={match}
                    onDone={() => router.replace(`/matches/${match.id}`, { scroll: false })}
                    onCancel={() => router.replace(`/matches/${match.id}`, { scroll: false })}
                  />
                </Card>
              )
            ) : (
              <ChangePlayers match={match} />
            ))}
        </>
      ) : (
        <NotYours owner={match.created_by} kind="match" />
      )}

      {match.status === "completed" && match.is_rated && <EloBreakdown match={match} />}
      {match.status === "completed" && !match.is_rated && (
        <p className="text-sm text-muted">This match is unrated, so it doesn&apos;t change anyone&apos;s rating.</p>
      )}
    </div>
  );
}

function WithParams() {
  const { id } = useParams<{ id: string }>();
  return <MatchDetail id={id} />;
}

export function MatchDetailView() {
  return (
    <WhenReady>
      <WithParams />
    </WhenReady>
  );
}
