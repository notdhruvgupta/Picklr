"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { TeamNames } from "@/components/bits";
import { ChevronRight, ListIcon, PlusIcon, StarIcon, TrophyIcon, UsersIcon } from "@/components/icons";
import { formatLabel } from "@/components/match";
import { ButtonLink, Card, LiveBadge, PageTitle, SectionTitle, cx } from "@/components/ui";
import { useOwnership } from "@/lib/data/ownership";
import { liveMatches, upcomingMatches } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import type { Match } from "@/lib/types";

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

function MatchLine({ match, index }: { match: Match; index?: number }) {
  const { canEdit, ownerName, multiple } = useOwnership();
  const mine = canEdit(match.created_by);
  const live = match.status === "live";
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {live ? <LiveBadge /> : index !== undefined && <span className="tabular w-5 text-sm font-bold text-muted">{index + 1}</span>}
      <div className="min-w-0 flex-1 text-sm">
        <div className="truncate">
          <TeamNames ids={match.team_a} link={false} /> <span className="text-muted">vs</span> <TeamNames ids={match.team_b} link={false} />
        </div>
        <div className="text-xs text-muted">
          {live && `${match.live_state ? `${match.live_state.current.a}–${match.live_state.current.b}` : "0–0"} · `}
          {match.bracket_label ?? formatLabel(match)}
          {multiple && !mine && ` · ${ownerName(match.created_by)}`}
        </div>
      </div>
      {mine ? (
        <>
          <ButtonLink href={`/ref/score/${match.id}`} size="sm" variant={live ? "primary" : "secondary"}>
            {live ? "Score" : "Start"}
          </ButtonLink>
          {!live && (
            <ButtonLink href={`/matches/${match.id}`} size="sm" variant="ghost">
              Edit
            </ButtonLink>
          )}
        </>
      ) : (
        <ButtonLink href={`/matches/${match.id}`} size="sm" variant="ghost">
          View
        </ButtonLink>
      )}
    </div>
  );
}

export function Dashboard() {
  const { matches, sessions, tournaments } = useData();
  const { canEdit, ownerName, myName, multiple } = useOwnership();
  const live = liveMatches(matches);
  const queue = upcomingMatches(matches);
  const myQueue = queue.filter((m) => canEdit(m.created_by));
  const otherQueue = queue.filter((m) => !canEdit(m.created_by));
  const mySession = [...sessions.values()].find((s) => s.status === "open" && canEdit(s.created_by));
  const otherSessions = [...sessions.values()].filter((s) => s.status === "open" && !canEdit(s.created_by));
  const activeTournaments = [...tournaments.values()].filter((t) => t.status === "active");

  return (
    <div className="space-y-8">
      <PageTitle
        subtitle={
          <>
            {myName ? `Signed in as ${myName}. ` : ""}Everything you change here shows up for watchers instantly.
          </>
        }
      >
        Referee
      </PageTitle>

      <div className="grid gap-3 sm:grid-cols-2">
        <Action href="/ref/match/new" title="New match" body="Pick players, start scoring or enter a result" icon={PlusIcon} primary />
        <Action
          href="/ref/session"
          title={mySession ? "Your session" : "Start a session"}
          body={mySession ? `${mySession.present_player_ids.length} checked in · fair rotation` : "Check players in and get fair rotations"}
          icon={UsersIcon}
        />
        <Action href="/ref/tournaments/new" title="New tournament" body="Round robin or knockout, seeded by rating" icon={TrophyIcon} />
        <Action href="/ref/players" title="Players" body="Add players, set starting ratings" icon={ListIcon} />
        <Action href="/ref/settings" title="Settings" body="Your name, rating settings and change log" icon={StarIcon} />
      </div>

      {otherSessions.length > 0 && (
        <p className="text-sm text-muted">
          Also running:{" "}
          {otherSessions.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ", "}
              <Link href={`/sessions/${s.id}`} className="font-semibold text-primary hover:underline">
                {ownerName(s.created_by)}&apos;s session
              </Link>
            </span>
          ))}
        </p>
      )}

      {live.length > 0 && (
        <section>
          <SectionTitle>Live</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {live.map((m) => (
              <MatchLine key={m.id} match={m} />
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>{multiple ? "Your queue" : "Queue"}</SectionTitle>
        {myQueue.length === 0 ? (
          <p className="text-sm text-muted">No matches waiting. Queue one from New match or a session.</p>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {myQueue.map((m, i) => (
              <MatchLine key={m.id} match={m} index={i} />
            ))}
          </Card>
        )}
      </section>

      {otherQueue.length > 0 && (
        <section>
          <SectionTitle>Other referees&apos; queues</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {otherQueue.map((m, i) => (
              <MatchLine key={m.id} match={m} index={i} />
            ))}
          </Card>
        </section>
      )}

      {activeTournaments.length > 0 && (
        <section>
          <SectionTitle>Running tournaments</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {activeTournaments.map((t) => (
              <Link key={t.id} href={`/tournaments/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/60">
                <span className="min-w-0 truncate font-semibold">{t.name}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {multiple && (canEdit(t.created_by) ? "Yours" : ownerName(t.created_by))}
                  <ChevronRight className="size-4" />
                </span>
              </Link>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
