"use client";

import Link from "next/link";
import { Avatar, Delta, TeamNames } from "@/components/bits";
import { ChevronRight } from "@/components/icons";
import { LeaderboardTable } from "@/components/leaderboard";
import { WhenReady } from "@/components/loading";
import { LiveMatchCard, MatchList, UpcomingRow } from "@/components/match";
import { ButtonLink, Card, Empty, SectionTitle } from "@/components/ui";
import { useAuth } from "@/lib/data/auth";
import { completedMatches, liveMatches, upcomingMatches } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import { useNow } from "@/lib/hooks/use-now";
import * as fmt from "@/lib/format";
import { biggestUpsets, movers } from "@/lib/stats";

const DAY = 24 * 60 * 60 * 1000;

function Highlights() {
  const { players, matches, ratings } = useData();
  const now = useNow();
  const since = new Date(now - 7 * DAY).toISOString();
  const active = [...players.values()].filter((p) => p.is_active).map((p) => p.id);
  const topMover = movers(ratings, active, "doubles", since)[0];
  const upset = biggestUpsets(ratings, 1)[0];
  const upsetMatch = upset ? matches.get(upset.matchId) : null;
  const streak = [...ratings.players.entries()]
    .filter(([id]) => players.get(id)?.is_active)
    .map(([id, r]) => ({ id, streak: Math.max(r.doubles.streak, r.singles.streak) }))
    .sort((a, b) => b.streak - a.streak)[0];

  const cards = [];
  if (topMover && topMover.change > 0) {
    const p = players.get(topMover.playerId)!;
    cards.push(
      <Link key="mover" href={`/players/${p.id}`} className="block">
        <Card className="flex h-full items-center gap-3 p-4">
          <Avatar name={p.name} />
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted">Biggest climber · 7 days</div>
            <div className="truncate font-semibold">
              {p.name} <Delta value={topMover.change} />
            </div>
          </div>
        </Card>
      </Link>,
    );
  }
  if (streak && streak.streak >= 2) {
    const p = players.get(streak.id)!;
    cards.push(
      <Link key="streak" href={`/players/${p.id}`} className="block">
        <Card className="flex h-full items-center gap-3 p-4">
          <Avatar name={p.name} />
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted">On fire</div>
            <div className="truncate font-semibold">
              {p.name} · {streak.streak} wins in a row
            </div>
          </div>
        </Card>
      </Link>,
    );
  }
  if (upset && upsetMatch) {
    const winners = upsetMatch.winner === "A" ? upsetMatch.team_a : upsetMatch.team_b;
    cards.push(
      <Link key="upset" href={`/matches/${upsetMatch.id}`} className="block">
        <Card className="h-full p-4">
          <div className="text-xs font-medium text-muted">Biggest upset</div>
          <div className="truncate font-semibold">
            <TeamNames ids={winners} link={false} /> won at {fmt.percent(upset.winnerExpected)}
          </div>
        </Card>
      </Link>,
    );
  }
  if (cards.length === 0) return null;
  return <div className="grid gap-3 sm:grid-cols-3">{cards}</div>;
}

function Home() {
  const { matches, sessions, players } = useData();
  const { isReferee } = useAuth();
  const live = liveMatches(matches);
  const upcoming = upcomingMatches(matches).slice(0, 4);
  const recent = completedMatches(matches).slice(0, 6);
  const openSession = [...sessions.values()].find((s) => s.status === "open");

  return (
    <div className="space-y-8">
      {live.length > 0 && (
        <section>
          <SectionTitle>Live now</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {live.map((m) => (
              <LiveMatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {openSession && (
        <Card className="flex items-center gap-3 border-ball/50 p-4">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Session in progress</div>
            <div className="truncate text-sm text-muted">
              {openSession.present_player_ids.length} checked in:{" "}
              {openSession.present_player_ids.map((id) => players.get(id)?.name).filter(Boolean).join(", ")}
            </div>
          </div>
          <ButtonLink href={`/sessions/${openSession.id}`} variant="secondary" size="sm">
            View
          </ButtonLink>
        </Card>
      )}

      {upcoming.length > 0 && (
        <section>
          <SectionTitle>Up next</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {upcoming.map((m, i) => (
              <UpcomingRow key={m.id} match={m} index={i} />
            ))}
          </Card>
        </section>
      )}

      <Highlights />

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle
            action={
              <Link href="/leaderboard" className="flex items-center text-sm font-semibold text-primary">
                Full ratings <ChevronRight className="size-4" />
              </Link>
            }
          >
            Doubles ratings
          </SectionTitle>
          <LeaderboardTable mode="doubles" limit={6} />
        </section>

        <section>
          <SectionTitle
            action={
              <Link href="/matches" className="flex items-center text-sm font-semibold text-primary">
                All matches <ChevronRight className="size-4" />
              </Link>
            }
          >
            Recent results
          </SectionTitle>
          {recent.length > 0 ? (
            <MatchList matches={recent} />
          ) : (
            <Empty
              title="No matches played yet"
              action={isReferee ? <ButtonLink href="/ref/match/new">Start a match</ButtonLink> : undefined}
            >
              Results and rating changes will appear here as soon as the referee records a match.
            </Empty>
          )}
        </section>
      </div>
    </div>
  );
}

export function HomeView() {
  return (
    <WhenReady>
      <Home />
    </WhenReady>
  );
}
