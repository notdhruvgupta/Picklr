"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { TeamNames } from "@/components/bits";
import { ChevronRight, ListIcon, PlusIcon, StarIcon, TrophyIcon, UsersIcon } from "@/components/icons";
import { formatLabel } from "@/components/match";
import { ButtonLink, Card, LiveBadge, PageTitle, SectionTitle, cx } from "@/components/ui";
import { liveMatches, upcomingMatches } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";

function Action({ href, title, body, icon: Icon, primary }: { href: string; title: string; body: string; icon: ComponentType<SVGProps<SVGSVGElement>>; primary?: boolean }) {
  return (
    <Link href={href}>
      <div
        className={cx(
          "flex h-full items-center gap-3 rounded-2xl border p-4 shadow-card transition-shadow hover:shadow-lg",
          primary ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface",
        )}
      >
        <Icon className="size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          <div className={cx("text-xs", primary ? "opacity-80" : "text-muted")}>{body}</div>
        </div>
        <ChevronRight className="size-4 opacity-60" />
      </div>
    </Link>
  );
}

export function Dashboard() {
  const { matches, sessions, tournaments } = useData();
  const live = liveMatches(matches);
  const queue = upcomingMatches(matches);
  const openSession = [...sessions.values()].find((s) => s.status === "open");
  const activeTournaments = [...tournaments.values()].filter((t) => t.status === "active");

  return (
    <div className="space-y-8">
      <PageTitle subtitle="Everything you change here shows up for watchers instantly.">Referee</PageTitle>

      <div className="grid gap-3 sm:grid-cols-2">
        <Action href="/ref/match/new" title="New match" body="Pick players, start scoring or enter a result" icon={PlusIcon} primary />
        <Action
          href="/ref/session"
          title={openSession ? "Today's session" : "Start a session"}
          body={openSession ? `${openSession.present_player_ids.length} checked in · fair rotation` : "Check players in and get fair rotations"}
          icon={UsersIcon}
        />
        <Action href="/ref/tournaments/new" title="New tournament" body="Round robin or knockout, seeded by rating" icon={TrophyIcon} />
        <Action href="/ref/players" title="Players" body="Add players, set starting ratings" icon={ListIcon} />
        <Action href="/ref/settings" title="Settings" body="Rating settings and change log" icon={StarIcon} />
      </div>

      {live.length > 0 && (
        <section>
          <SectionTitle>Live</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {live.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <LiveBadge />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate">
                    <TeamNames ids={m.team_a} link={false} /> <span className="text-muted">vs</span> <TeamNames ids={m.team_b} link={false} />
                  </div>
                  <div className="text-xs text-muted">
                    {m.live_state ? `${m.live_state.current.a}–${m.live_state.current.b}` : "0–0"} · {formatLabel(m)}
                  </div>
                </div>
                <ButtonLink href={`/ref/score/${m.id}`} size="sm">
                  Score
                </ButtonLink>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Queue</SectionTitle>
        {queue.length === 0 ? (
          <p className="text-sm text-muted">No matches waiting. Queue one from New match or a session.</p>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {queue.map((m, i) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span className="tabular w-5 text-sm font-bold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate">
                    <TeamNames ids={m.team_a} link={false} /> <span className="text-muted">vs</span> <TeamNames ids={m.team_b} link={false} />
                  </div>
                  <div className="text-xs text-muted">{m.bracket_label ?? formatLabel(m)}</div>
                </div>
                <ButtonLink href={`/ref/score/${m.id}`} size="sm" variant="secondary">
                  Start
                </ButtonLink>
                <ButtonLink href={`/matches/${m.id}`} size="sm" variant="ghost">
                  Edit
                </ButtonLink>
              </div>
            ))}
          </Card>
        )}
      </section>

      {activeTournaments.length > 0 && (
        <section>
          <SectionTitle>Running tournaments</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {activeTournaments.map((t) => (
              <Link key={t.id} href={`/tournaments/${t.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface-2/60">
                <span className="font-semibold">{t.name}</span>
                <ChevronRight className="size-4 text-muted" />
              </Link>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
