"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Mode } from "@/lib/elo";
import { useData } from "@/lib/data/store";
import * as fmt from "@/lib/format";
import { biggestUpsets } from "@/lib/stats";
import { TeamNames } from "./bits";
import { Card } from "./ui";

function Record({ label, value, who, href }: { label: string; value: ReactNode; who: ReactNode; href: string }) {
  return (
    <Link href={href} className="block">
      <Card className="h-full p-4 transition-shadow hover:shadow-lg">
        <div className="text-xs font-medium text-muted">{label}</div>
        <div className="mt-1 text-xl font-bold">{value}</div>
        <div className="truncate text-sm">{who}</div>
      </Card>
    </Link>
  );
}

export function Records({ mode }: { mode: Mode }) {
  const { ratings, players, matches } = useData();
  const rows = [...ratings.players.entries()]
    .filter(([id]) => players.has(id))
    .map(([id, r]) => ({ id, s: r[mode] }))
    .filter((r) => r.s.matches > 0);
  if (rows.length === 0) return null;

  const peak = [...rows].sort((a, b) => b.s.peak - a.s.peak)[0];
  const streak = [...rows].sort((a, b) => b.s.bestWinStreak - a.s.bestWinStreak)[0];
  const most = [...rows].sort((a, b) => b.s.matches - a.s.matches)[0];
  const upset = biggestUpsets(ratings, 1, mode)[0];
  const upsetMatch = upset ? matches.get(upset.matchId) : undefined;
  const name = (id: string) => players.get(id)?.name;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Record label="Highest rating" value={fmt.rating(peak.s.peak)} who={name(peak.id)} href={`/players/${peak.id}`} />
      {streak.s.bestWinStreak > 1 && (
        <Record label="Longest win streak" value={`${streak.s.bestWinStreak} wins`} who={name(streak.id)} href={`/players/${streak.id}`} />
      )}
      <Record label="Most matches" value={most.s.matches} who={name(most.id)} href={`/players/${most.id}`} />
      {upsetMatch && (
        <Record
          label="Biggest upset"
          value={`${fmt.percent(upset.winnerExpected)} odds`}
          who={<TeamNames ids={upsetMatch.winner === "A" ? upsetMatch.team_a : upsetMatch.team_b} link={false} />}
          href={`/matches/${upsetMatch.id}`}
        />
      )}
    </div>
  );
}
