"use client";

import { useParams } from "next/navigation";
import { TeamNames } from "@/components/bits";
import { WhenReady } from "@/components/loading";
import { LiveMatchCard, MatchList, UpcomingRow } from "@/components/match";
import { RunBy } from "@/components/ownership";
import { SessionStandings, ShareRecap, useSessionSummary } from "@/components/session";
import { Badge, ButtonLink, Card, Empty, PageTitle, SectionTitle } from "@/components/ui";
import { useOwnership } from "@/lib/data/ownership";
import { useData } from "@/lib/data/store";
import * as fmt from "@/lib/format";
import type { PlaySession } from "@/lib/types";

function Session({ session }: { session: PlaySession }) {
  const { canEdit } = useOwnership();
  const { list, completed } = useSessionSummary(session);
  const live = list.filter((m) => m.status === "live");
  const queued = list.filter((m) => m.status === "scheduled");
  return (
    <div className="space-y-8">
      <PageTitle
        subtitle={
          <>
            {session.mode === "doubles" ? "Doubles" : "Singles"} · {completed.length} matches · <TeamNames list ids={session.present_player_ids} link={false} />
            <RunBy owner={session.created_by} className="block" />
          </>
        }
        action={
          <div className="flex gap-2">
            <ShareRecap session={session} />
            {canEdit(session.created_by) && session.status === "open" && (
              <ButtonLink href="/ref/session" size="sm">
                Manage
              </ButtonLink>
            )}
          </div>
        }
      >
        <span className="flex items-center gap-2">
          {fmt.day(session.created_at)} {session.status === "open" && <Badge tone="ball">In progress</Badge>}
        </span>
      </PageTitle>

      {live.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {live.map((m) => (
            <LiveMatchCard key={m.id} match={m} />
          ))}
        </div>
      )}

      {queued.length > 0 && (
        <section>
          <SectionTitle>Up next</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {queued.map((m, i) => (
              <UpcomingRow key={m.id} match={m} index={i} />
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Standings</SectionTitle>
        <SessionStandings session={session} />
      </section>

      {completed.length > 0 && (
        <section>
          <SectionTitle>Matches</SectionTitle>
          <MatchList matches={[...completed].reverse()} showDate={false} />
        </section>
      )}
    </div>
  );
}

function WithParams() {
  const { id } = useParams<{ id: string }>();
  const { sessions } = useData();
  const session = sessions.get(id);
  if (!session) return <Empty title="Session not found" action={<ButtonLink href="/sessions" variant="secondary">All sessions</ButtonLink>} />;
  return <Session session={session} />;
}

export function SessionView() {
  return (
    <WhenReady>
      <WithParams />
    </WhenReady>
  );
}
