"use client";

import Link from "next/link";
import { TeamNames } from "@/components/bits";
import { ChevronRight, TrophyIcon } from "@/components/icons";
import { WhenReady } from "@/components/loading";
import { Badge, ButtonLink, Card, Empty, PageTitle, SectionTitle } from "@/components/ui";
import { useAuth } from "@/lib/data/auth";
import { useData } from "@/lib/data/store";
import * as fmt from "@/lib/format";
import { formatName } from "@/lib/tournament";
import type { Tournament } from "@/lib/types";

function Row({ t }: { t: Tournament }) {
  const { entries, matches } = useData();
  const winner = t.winner_entry_id ? entries.get(t.winner_entry_id) : undefined;
  const list = [...matches.values()].filter((m) => m.tournament_id === t.id && m.status !== "void");
  const done = list.filter((m) => m.status === "completed").length;
  return (
    <Link href={`/tournaments/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
      <TrophyIcon className={t.status === "completed" ? "size-5 text-primary" : "size-5 text-muted"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-semibold">
          <span className="truncate">{t.name}</span>
          {t.status === "active" && <Badge tone="ball">In progress</Badge>}
          {t.status === "cancelled" && <Badge>Cancelled</Badge>}
        </div>
        <div className="truncate text-xs text-muted">
          {formatName(t.format)} · {t.mode} · {fmt.day(t.created_at)}
          {winner ? (
            <>
              {" "}
              · Champion <TeamNames ids={winner.player_ids} link={false} />
            </>
          ) : (
            ` · ${done}/${list.length} played`
          )}
        </div>
      </div>
      <ChevronRight className="size-4 text-muted" />
    </Link>
  );
}

export function TournamentsView() {
  const { tournaments } = useData();
  const { isReferee } = useAuth();
  const list = [...tournaments.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const active = list.filter((t) => t.status === "active");
  const past = list.filter((t) => t.status !== "active");
  return (
    <WhenReady>
      <PageTitle action={isReferee && <ButtonLink href="/ref/tournaments/new">New tournament</ButtonLink>}>Tournaments</PageTitle>
      {list.length === 0 ? (
        <Empty title="No tournaments yet">Round robins and brackets, seeded by Elo, will show up here.</Empty>
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <section>
              <SectionTitle>In progress</SectionTitle>
              <Card className="divide-y divide-line overflow-hidden">
                {active.map((t) => (
                  <Row key={t.id} t={t} />
                ))}
              </Card>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <SectionTitle>Past</SectionTitle>
              <Card className="divide-y divide-line overflow-hidden">
                {past.map((t) => (
                  <Row key={t.id} t={t} />
                ))}
              </Card>
            </section>
          )}
        </div>
      )}
    </WhenReady>
  );
}
