"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Delta, TeamNames } from "@/components/bits";
import { GamesInput, filledGames } from "@/components/games-input";
import { TvIcon } from "@/components/icons";
import { WhenReady } from "@/components/loading";
import { Scoreboard, WinChanceBar, formatLabel, formatOf, useWinChance } from "@/components/match";
import { Badge, Button, ButtonLink, Card, Empty, ErrorNote, LiveBadge, SectionTitle } from "@/components/ui";
import { completeMatch, deleteMatch, friendlyError, updateMatch } from "@/lib/data/actions";
import { useAuth } from "@/lib/data/auth";
import { matchTime, teamLabel } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import type { GameResult } from "@/lib/elo";
import * as fmt from "@/lib/format";
import { validateFinalGames } from "@/lib/scoring";
import type { Match } from "@/lib/types";

function StatusBadge({ match }: { match: Match }) {
  if (match.status === "live") return <LiveBadge />;
  if (match.status === "completed") return <Badge tone="primary">Final</Badge>;
  if (match.status === "void") return <Badge tone="loss">Voided</Badge>;
  return <Badge>Scheduled</Badge>;
}

function EloBreakdown({ match }: { match: Match }) {
  const { ratings, players, config } = useData();
  const info = ratings.byMatch.get(match.id);
  if (!info) return null;
  const winnerExpected = info.winner === "A" ? info.expectedA : 1 - info.expectedA;
  return (
    <section>
      <SectionTitle>Rating changes</SectionTitle>
      <Card className="overflow-hidden">
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

  return (
    <Card className="space-y-4 border-ball/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Referee</h2>
        <Badge tone="ball">Only you see this</Badge>
      </div>

      {(match.status === "scheduled" || match.status === "live") && (
        <ButtonLink href={`/ref/score/${match.id}`} size="lg" className="w-full">
          {match.status === "live" ? "Continue scoring" : "Start scoring"}
        </ButtonLink>
      )}

      {editing || (match.status === "scheduled" && match.team_a.length > 0 && match.team_b.length > 0) ? (
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
        {match.status === "completed" && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => updateMatch(match.id, { is_rated: !match.is_rated }))}>
            {match.is_rated ? "Make unrated" : "Make rated"}
          </Button>
        )}
        {match.status === "completed" && !inTournament && (
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (confirm("Void this match? It stays on record but stops counting toward ratings.")) {
                void run(() => updateMatch(match.id, { status: "void" }));
              }
            }}
          >
            Void
          </Button>
        )}
        {match.status === "void" && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => run(() => updateMatch(match.id, { status: match.winner ? "completed" : "scheduled" }))}
          >
            Restore
          </Button>
        )}
        {!inTournament && match.status !== "live" && (
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (confirm("Delete this match permanently? Ratings will be recalculated without it.")) {
                void run(async () => {
                  await deleteMatch(match.id);
                  router.push("/matches");
                });
              }
            }}
          >
            Delete
          </Button>
        )}
      </div>
      {inTournament && match.status === "completed" && (
        <p className="text-xs text-muted">Tournament matches can be corrected but not voided or deleted, so the bracket stays consistent.</p>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}

function MatchDetail({ id }: { id: string }) {
  const { matches, tournaments } = useData();
  const { isReferee } = useAuth();
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

      {isReferee && <RefereePanel key={`${match.id}-${match.updated_at}`} match={match} />}

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
