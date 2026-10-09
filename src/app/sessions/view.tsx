"use client";

import Link from "next/link";
import { ChevronRight } from "@/components/icons";
import { WhenReady } from "@/components/loading";
import { useSessionSummary } from "@/components/session";
import { Badge, Card, Empty, PageTitle } from "@/components/ui";
import { useData } from "@/lib/data/store";
import * as fmt from "@/lib/format";
import type { PlaySession } from "@/lib/types";

function SessionRow({ session }: { session: PlaySession }) {
  const { players } = useData();
  const { completed, lines } = useSessionSummary(session);
  const mvp = lines[0];
  return (
    <Link href={`/sessions/${session.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-semibold">
          {fmt.day(session.created_at)}
          {session.status === "open" && <Badge tone="ball">In progress</Badge>}
        </div>
        <div className="truncate text-xs text-muted">
          {completed.length} matches · {session.present_player_ids.length} players
          {mvp && mvp.delta > 0 ? ` · MVP ${players.get(mvp.playerId)?.name}` : ""}
        </div>
      </div>
      <ChevronRight className="size-4 text-muted" />
    </Link>
  );
}

export function SessionsView() {
  const { sessions } = useData();
  const list = [...sessions.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <WhenReady>
      <PageTitle subtitle="Each day of play, with that day's standings.">Sessions</PageTitle>
      {list.length === 0 ? (
        <Empty title="No sessions yet">The referee starts a session at the court and checks players in.</Empty>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {list.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </Card>
      )}
    </WhenReady>
  );
}
