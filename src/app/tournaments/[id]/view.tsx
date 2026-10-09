"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { TeamNames } from "@/components/bits";
import { Bracket } from "@/components/bracket";
import { useConfirm } from "@/components/confirm";
import { TrophyIcon } from "@/components/icons";
import { WhenReady } from "@/components/loading";
import { MatchRow, UpcomingRow, formatLabel } from "@/components/match";
import { Badge, Button, ButtonLink, Card, Empty, ErrorNote, PageTitle, SectionTitle } from "@/components/ui";
import { standings, type Standing } from "@/lib/brackets";
import { friendlyError } from "@/lib/data/actions";
import { useAuth } from "@/lib/data/auth";
import { useData } from "@/lib/data/store";
import { check, supabase } from "@/lib/supabase";
import { formatName, playoffMatches } from "@/lib/tournament";
import type { Match, Tournament, TournamentEntry } from "@/lib/types";

function StandingsTable({ rows, entries, highlight }: { rows: Standing[]; entries: Map<string, TournamentEntry>; highlight: number }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-4 py-2 text-left font-medium">#</th>
            <th className="px-2 py-2 text-left font-medium">Team</th>
            <th className="px-2 py-2 text-right font-medium">W–L</th>
            <th className="px-2 py-2 text-right font-medium">Pts</th>
            <th className="px-4 py-2 text-right font-medium">+/−</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => {
            const e = entries.get(r.entryId);
            const diff = r.pointsFor - r.pointsAgainst;
            return (
              <tr key={r.entryId} className={i < highlight ? "bg-primary/5" : undefined}>
                <td className="tabular px-4 py-2.5 font-bold text-muted">{i + 1}</td>
                <td className="px-2 py-2.5 font-medium">
                  <TeamNames ids={e?.player_ids ?? []} />
                  <span className="ml-1.5 text-xs text-muted">({e?.seed})</span>
                </td>
                <td className="tabular px-2 py-2.5 text-right">
                  {r.wins}–{r.losses}
                </td>
                <td className="tabular px-2 py-2.5 text-right text-muted">
                  {r.pointsFor}–{r.pointsAgainst}
                </td>
                <td className="tabular px-4 py-2.5 text-right font-semibold">{diff > 0 ? `+${diff}` : diff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function groupStandings(group: Match[], entries: TournamentEntry[]): Standing[] {
  return standings(
    entries.map((e) => ({ id: e.id, seed: e.seed })),
    group
      .filter((m) => m.status === "completed" && m.winner && m.entry_a_id && m.entry_b_id)
      .map((m) => ({
        a: m.entry_a_id!,
        b: m.entry_b_id!,
        winner: m.winner!,
        pointsA: m.games.reduce((s, g) => s + g.a, 0),
        pointsB: m.games.reduce((s, g) => s + g.b, 0),
      })),
  );
}

function RefereeActions({ t, list, table }: { t: Tournament; list: Match[]; table: Standing[] }) {
  const { entries } = useData();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const group = list.filter((m) => m.stage === "group");
  const playoffs = list.filter((m) => m.stage === "playoff");
  const groupDone = group.length > 0 && group.every((m) => m.status === "completed");
  const isRR = t.format === "round_robin";

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

  const startPlayoffs = () =>
    run(async () => {
      const finishers = table.map((r) => {
        const e = entries.get(r.entryId)!;
        return { id: e.id, seed: e.seed, playerIds: e.player_ids };
      });
      const rows = playoffMatches(
        { id: t.id, format: t.format, mode: t.mode, scoring: t.scoring, pointsToWin: t.points_to_win, winBy: t.win_by, bestOf: t.best_of, isRated: t.is_rated },
        finishers,
        t.playoff_size,
        () => crypto.randomUUID(),
        Math.max(0, ...list.map((m) => m.queue_position ?? 0)),
      );
      check(await supabase.rpc("insert_tournament_matches", { p_matches: rows }));
    });

  const finish = () =>
    run(async () => {
      check(
        await supabase
          .from("tournaments")
          .update({ status: "completed", winner_entry_id: table[0]?.entryId ?? null, completed_at: new Date().toISOString() })
          .eq("id", t.id),
      );
    });

  const cancel = async () => {
    const live = list.filter((m) => m.status === "live").length;
    const ok = await confirm({
      title: `Cancel ${t.name}?`,
      body: (
        <>
          Completed matches stay on record and keep counting toward ratings. Unplayed matches are removed from the queue
          {live > 0 ? <>, and the match being played now is stopped</> : null}. This can&apos;t be undone.
        </>
      ),
      confirmLabel: "Cancel tournament",
      cancelLabel: "Keep it",
      danger: true,
    });
    if (ok) await run(async () => void check(await supabase.rpc("cancel_tournament", { p_tournament_id: t.id })));
  };

  if (t.status !== "active") return null;
  return (
    <Card className="space-y-3 border-ball/60 p-4">
      <p className="font-semibold">Referee</p>
      <div className="flex flex-wrap gap-2">
        {isRR && groupDone && t.playoff_size > 0 && playoffs.length === 0 && (
          <Button onClick={startPlayoffs} disabled={busy}>
            Start playoffs (top {t.playoff_size})
          </Button>
        )}
        {isRR && groupDone && t.playoff_size === 0 && (
          <Button onClick={finish} disabled={busy}>
            Finish: crown the table leader
          </Button>
        )}
        <Button variant="danger" size="sm" onClick={cancel} disabled={busy}>
          Cancel tournament
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}

function TournamentDetail({ t }: { t: Tournament }) {
  const { matches, entries } = useData();
  const { isReferee } = useAuth();
  const list = [...matches.values()].filter((m) => m.tournament_id === t.id).sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
  const tEntries = [...entries.values()].filter((e) => e.tournament_id === t.id).sort((a, b) => a.seed - b.seed);
  const group = list.filter((m) => m.stage === "group");
  const playoffs = list.filter((m) => m.stage === "playoff");
  const isRR = t.format === "round_robin";
  const table = isRR ? groupStandings(group, tEntries) : [];
  const champion = t.winner_entry_id ? entries.get(t.winner_entry_id) : undefined;
  const next = list.filter((m) => m.status === "scheduled" && m.team_a.length > 0 && m.team_b.length > 0);
  const live = list.filter((m) => m.status === "live");
  const rounds = new Map<number, Match[]>();
  for (const m of group) rounds.set(m.bracket_round ?? 0, [...(rounds.get(m.bracket_round ?? 0) ?? []), m]);

  return (
    <div className="space-y-8">
      <PageTitle
        subtitle={`${formatName(t.format, t.round_robin_cycles)}${isRR && t.playoff_size ? ` + top-${t.playoff_size} playoff` : ""} · ${t.mode} · ${formatLabel({ mode: t.mode, scoring: t.scoring, points_to_win: t.points_to_win, best_of: t.best_of }).split(" · ").slice(1).join(" · ")}${t.is_rated ? "" : " · unrated"}`}
      >
        <span className="flex flex-wrap items-center gap-2">
          {t.name}
          {t.status === "active" && <Badge tone="ball">In progress</Badge>}
          {t.status === "cancelled" && <Badge>Cancelled</Badge>}
        </span>
      </PageTitle>

      {champion && (
        <Card className="flex items-center gap-4 border-ball bg-ball/10 p-5">
          <TrophyIcon className="size-10 shrink-0" />
          <div>
            <div className="text-xs font-semibold tracking-wide text-muted uppercase">Champions</div>
            <div className="text-xl font-bold">
              <TeamNames ids={champion.player_ids} />
            </div>
          </div>
        </Card>
      )}

      {isReferee && <RefereeActions t={t} list={list} table={table} />}

      {(live.length > 0 || next.length > 0) && t.status === "active" && (
        <section>
          <SectionTitle>{live.length ? "On court" : "Up next"}</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {[...live, ...next.slice(0, live.length ? 2 : 3)].map((m, i) => (
              <div key={m.id} className="flex items-center">
                <div className="min-w-0 flex-1">
                  <UpcomingRow match={m} index={m.status === "live" ? undefined : i - live.length} />
                </div>
                {isReferee && (
                  <ButtonLink href={`/ref/score/${m.id}`} size="sm" className="mr-4">
                    {m.status === "live" ? "Score" : "Start"}
                  </ButtonLink>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}

      {isRR ? (
        <>
          <section>
            <SectionTitle>Standings</SectionTitle>
            <StandingsTable rows={table} entries={entries} highlight={t.playoff_size} />
            {t.playoff_size > 0 && <p className="mt-2 text-xs text-muted">Top {t.playoff_size} go through to the playoff.</p>}
          </section>
          {playoffs.length > 0 && (
            <section>
              <SectionTitle>Playoffs</SectionTitle>
              <Bracket matches={playoffs} />
            </section>
          )}
          <section className="space-y-4">
            <SectionTitle>Matches</SectionTitle>
            {[...rounds.entries()].map(([round, ms]) => (
              <div key={round}>
                <h3 className="mb-2 text-sm font-semibold text-muted">{ms[0].bracket_label ?? `Round ${round}`}</h3>
                <Card className="divide-y divide-line overflow-hidden">
                  {ms.map((m) =>
                    m.status === "completed" || m.status === "void" ? <MatchRow key={m.id} match={m} showDate={false} /> : <UpcomingRow key={m.id} match={m} />,
                  )}
                </Card>
              </div>
            ))}
          </section>
        </>
      ) : (
        <section>
          <SectionTitle>Bracket</SectionTitle>
          <Bracket matches={list} />
        </section>
      )}

      <section>
        <SectionTitle>Seeds</SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          {tEntries.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="tabular w-6 font-bold text-muted">#{e.seed}</span>
              <TeamNames ids={e.player_ids} />
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

function WithParams() {
  const { id } = useParams<{ id: string }>();
  const { tournaments } = useData();
  const t = tournaments.get(id);
  if (!t) return <Empty title="Tournament not found" action={<ButtonLink href="/tournaments" variant="secondary">All tournaments</ButtonLink>} />;
  return <TournamentDetail t={t} />;
}

export function TournamentView() {
  return (
    <WhenReady>
      <WithParams />
    </WhenReady>
  );
}
