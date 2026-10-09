"use client";

import { useState } from "react";
import { WhenReady } from "@/components/loading";
import { LiveMatchCard, MatchList, UpcomingRow } from "@/components/match";
import { Button, ButtonLink, Card, Empty, PageTitle, SectionTitle, Segmented, Select } from "@/components/ui";
import { useAuth } from "@/lib/data/auth";
import { completedMatches, liveMatches, matchTime, upcomingMatches } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import type { Mode } from "@/lib/elo";
import * as fmt from "@/lib/format";
import type { Match } from "@/lib/types";

const PAGE = 40;

function groupByDay(matches: Match[]): [string, Match[]][] {
  const groups = new Map<string, Match[]>();
  for (const m of matches) {
    const key = fmt.localDateKey(matchTime(m));
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups];
}

function Matches() {
  const { matches, players } = useData();
  const { isReferee } = useAuth();
  const [mode, setMode] = useState<Mode | "all">("all");
  const [playerId, setPlayerId] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const filter = (m: Match) =>
    (mode === "all" || m.mode === mode) && (!playerId || m.team_a.includes(playerId) || m.team_b.includes(playerId));
  const live = liveMatches(matches).filter(filter);
  const upcoming = upcomingMatches(matches).filter(filter);
  const done = completedMatches(matches, filter);
  const shown = done.slice(0, limit);

  return (
    <>
      <PageTitle
        action={
          <div className="flex gap-2">
            <ButtonLink href="/sessions" variant="secondary">
              Sessions
            </ButtonLink>
            {isReferee && <ButtonLink href="/ref/match/new">New match</ButtonLink>}
          </div>
        }
      >
        Matches
      </PageTitle>
      <div className="mb-5 flex flex-wrap gap-3">
        <Segmented
          label="Match type"
          value={mode}
          onChange={setMode}
          options={[
            { value: "all", label: "All" },
            { value: "doubles", label: "Doubles" },
            { value: "singles", label: "Singles" },
          ]}
        />
        <Select aria-label="Filter by player" value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="w-48">
          <option value="">Everyone</option>
          {[...players.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
      </div>

      <div className="space-y-8">
        {live.length > 0 && (
          <section>
            <SectionTitle>Live</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              {live.map((m) => (
                <LiveMatchCard key={m.id} match={m} />
              ))}
            </div>
          </section>
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

        {done.length === 0 ? (
          <Empty title="No results yet">{playerId || mode !== "all" ? "Try clearing the filters." : "Completed matches will show up here."}</Empty>
        ) : (
          groupByDay(shown).map(([day, list]) => (
            <section key={day}>
              <SectionTitle>
                {fmt.day(matchTime(list[0]))} · {list.length} match{list.length === 1 ? "" : "es"}
              </SectionTitle>
              <MatchList matches={list} showDate={false} />
            </section>
          ))
        )}

        {done.length > limit && (
          <div className="text-center">
            <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
              Show more
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

export function MatchesView() {
  return (
    <WhenReady>
      <Matches />
    </WhenReady>
  );
}
