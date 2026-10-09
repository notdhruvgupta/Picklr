"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Avatar, Stat } from "@/components/bits";
import { WhenReady } from "@/components/loading";
import { MatchList } from "@/components/match";
import { PlayerRatingChart } from "@/components/rating-chart";
import { Badge, ButtonLink, Card, Empty, PageTitle, SectionTitle, Segmented, Select } from "@/components/ui";
import { useAuth } from "@/lib/data/auth";
import { completedMatches, statMatches } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import { leaderboard, type Mode } from "@/lib/elo";
import * as fmt from "@/lib/format";
import { headToHead, opponentStats, partnerStats, type PairRecord } from "@/lib/stats";

function RecordTable({ title, rows, empty, label }: { title: string; rows: PairRecord[]; empty: string; label: string }) {
  const { players } = useData();
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{label}</th>
                <th className="px-2 py-2 text-right font-medium">W–L</th>
                <th className="px-4 py-2 text-right font-medium">Win %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.slice(0, 6).map((r) => (
                <tr key={r.playerId}>
                  <td className="px-4 py-2">
                    <Link href={`/players/${r.playerId}`} className="font-medium hover:underline">
                      {players.get(r.playerId)?.name ?? "Unknown"}
                    </Link>
                  </td>
                  <td className="tabular px-2 py-2 text-right">
                    {r.wins}–{r.played - r.wins}
                  </td>
                  <td className="tabular px-4 py-2 text-right font-semibold">{fmt.winRate(r.wins, r.played)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

function HeadToHeadPicker({ playerId }: { playerId: string }) {
  const { players, matches } = useData();
  const [other, setOther] = useState("");
  const all = statMatches(matches);
  const h = other ? headToHead(playerId, other, all) : null;
  const name = players.get(playerId)?.name;
  const otherName = players.get(other)?.name;
  return (
    <section>
      <SectionTitle>Head to head</SectionTitle>
      <Card className="space-y-3 p-4">
        <Select aria-label="Compare with" value={other} onChange={(e) => setOther(e.target.value)}>
          <option value="">Compare with…</option>
          {[...players.values()]
            .filter((p) => p.id !== playerId)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
        {h && (
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label={`Against ${otherName}`}
              value={h.against.played ? `${h.against.wins}–${h.against.played - h.against.wins}` : "–"}
              sub={h.against.played ? `${name} wins ${fmt.winRate(h.against.wins, h.against.played)}` : "Never met"}
            />
            <Stat
              label={`Together with ${otherName}`}
              value={h.together.played ? `${h.together.wins}–${h.together.played - h.together.wins}` : "–"}
              sub={h.together.played ? fmt.winRate(h.together.wins, h.together.played) : "Never partnered"}
            />
          </div>
        )}
      </Card>
    </section>
  );
}

function Profile({ id }: { id: string }) {
  const { players, matches, ratings, config } = useData();
  const { isReferee } = useAuth();
  const [mode, setMode] = useState<Mode>("doubles");
  const player = players.get(id);
  if (!player) {
    return <Empty title="Player not found" action={<ButtonLink href="/players" variant="secondary">All players</ButtonLink>} />;
  }

  const stats = ratings.players.get(id)?.[mode];
  const ids = [...players.values()].filter((p) => p.is_active || p.id === id).map((p) => p.id);
  const rank = leaderboard(ratings, mode, ids, config).find((r) => r.playerId === id)?.rank ?? null;
  const all = statMatches(matches).filter((m) => m.mode === mode);
  const partners = mode === "doubles" ? partnerStats(id, all) : [];
  const opponents = opponentStats(id, all, mode);
  const toughest = [...opponents].filter((o) => o.played >= 2).sort((a, b) => a.wins / a.played - b.wins / b.played);
  const recent = completedMatches(matches, (m) => m.mode === mode && (m.team_a.includes(id) || m.team_b.includes(id))).slice(0, 10);

  return (
    <div className="space-y-8">
      <PageTitle
        action={isReferee && <ButtonLink href={`/ref/players?edit=${id}`} variant="secondary" size="sm">Edit</ButtonLink>}
      >
        <span className="flex items-center gap-3">
          <Avatar name={player.name} size="xl" />
          <span>
            {player.name}
            {player.nickname && <span className="block text-base font-medium text-muted">“{player.nickname}”</span>}
          </span>
          {!player.is_active && <Badge>Inactive</Badge>}
        </span>
      </PageTitle>

      <Segmented
        label="Rating type"
        value={mode}
        onChange={setMode}
        options={[
          { value: "doubles", label: "Doubles" },
          { value: "singles", label: "Singles" },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rating" value={fmt.rating(stats?.rating ?? (mode === "singles" ? player.initial_singles : player.initial_doubles))} sub={rank ? `#${rank} of ${ids.length}` : "Unranked"} />
        <Stat label="Record" value={stats && stats.matches ? `${stats.wins}–${stats.losses}` : "–"} sub={stats ? fmt.winRate(stats.wins, stats.matches) : undefined} />
        <Stat
          label="Streak"
          value={!stats || stats.streak === 0 ? "–" : stats.streak > 0 ? `${stats.streak}W` : `${-stats.streak}L`}
          sub={stats?.bestWinStreak ? `Best ${stats.bestWinStreak}W` : undefined}
        />
        <Stat label="Peak" value={stats ? fmt.rating(stats.peak) : "–"} sub={stats ? `Started ${fmt.rating(stats.start)}` : undefined} />
      </div>

      <section>
        <SectionTitle>Rating history</SectionTitle>
        <Card className="p-3">
          <PlayerRatingChart playerId={id} mode={mode} />
        </Card>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        {mode === "doubles" && <RecordTable title="Partners" label="Partner" rows={partners} empty="No doubles matches yet." />}
        <RecordTable title="Toughest opponents" label="Opponent" rows={toughest} empty="Needs at least two matches against someone." />
        <HeadToHeadPicker playerId={id} />
      </div>

      <section>
        <SectionTitle>Recent {mode} matches</SectionTitle>
        {recent.length ? <MatchList matches={recent} /> : <p className="text-sm text-muted">No {mode} matches yet.</p>}
      </section>
    </div>
  );
}

function WithParams() {
  const { id } = useParams<{ id: string }>();
  return <Profile id={id} />;
}

export function PlayerView() {
  return (
    <WhenReady>
      <WithParams />
    </WhenReady>
  );
}
