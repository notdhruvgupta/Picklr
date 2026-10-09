"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/bits";
import { WhenReady } from "@/components/loading";
import { Button, ButtonLink, Card, PageTitle, SectionTitle } from "@/components/ui";
import { useAuth } from "@/lib/data/auth";
import { playersByRating } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import * as fmt from "@/lib/format";
import type { Player } from "@/lib/types";

function PlayerCard({ player }: { player: Player }) {
  const { ratings } = useData();
  const r = ratings.players.get(player.id);
  const doubles = r?.doubles.rating ?? player.initial_doubles;
  const singles = r?.singles.rating ?? player.initial_singles;
  const played = (r?.doubles.matches ?? 0) + (r?.singles.matches ?? 0);
  const wins = (r?.doubles.wins ?? 0) + (r?.singles.wins ?? 0);
  return (
    <Link href={`/players/${player.id}`}>
      <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-lg">
        <Avatar name={player.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{player.name}</div>
          <div className="text-xs text-muted">{played === 0 ? "No matches yet" : `${wins}–${played - wins} overall`}</div>
        </div>
        <div className="text-right text-sm">
          <div>
            <span className="tabular font-bold">{fmt.rating(doubles)}</span> <span className="text-xs text-muted">D</span>
          </div>
          <div className="text-muted">
            <span className="tabular">{fmt.rating(singles)}</span> <span className="text-xs">S</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function Players() {
  const { players, ratings } = useData();
  const { isReferee } = useAuth();
  const [showInactive, setShowInactive] = useState(false);
  const all = playersByRating(players, ratings, "doubles", false);
  const active = all.filter((p) => p.is_active);
  const inactive = all.filter((p) => !p.is_active);

  return (
    <>
      <PageTitle
        subtitle={`${active.length} active players`}
        action={isReferee && <ButtonLink href="/ref/players" variant="secondary">Manage players</ButtonLink>}
      >
        Players
      </PageTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((p) => (
          <PlayerCard key={p.id} player={p} />
        ))}
      </div>
      {inactive.length > 0 && (
        <section className="mt-8">
          <SectionTitle
            action={
              <Button variant="ghost" size="sm" onClick={() => setShowInactive((s) => !s)}>
                {showInactive ? "Hide" : `Show ${inactive.length}`}
              </Button>
            }
          >
            Inactive
          </SectionTitle>
          {showInactive && (
            <div className="grid gap-3 opacity-80 sm:grid-cols-2 lg:grid-cols-3">
              {inactive.map((p) => (
                <PlayerCard key={p.id} player={p} />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

export function PlayersView() {
  return (
    <WhenReady>
      <Players />
    </WhenReady>
  );
}
