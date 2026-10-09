"use client";

import Link from "next/link";
import { leaderboard, type Mode } from "@/lib/elo";
import { useData } from "@/lib/data/store";
import { useNow } from "@/lib/hooks/use-now";
import * as fmt from "@/lib/format";
import { ratingChangeSince } from "@/lib/stats";
import { Avatar, Delta, Sparkline } from "./bits";
import { Badge, Card, Empty, cx } from "./ui";

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function LeaderboardTable({ mode, limit, showInactive = false }: { mode: Mode; limit?: number; showInactive?: boolean }) {
  const { players, ratings, config } = useData();
  const ids = [...players.values()].filter((p) => showInactive || p.is_active).map((p) => p.id);
  const rows = leaderboard(ratings, mode, ids, config);
  const now = useNow();
  const since = new Date(now - WEEK).toISOString();
  const shown = limit ? rows.slice(0, limit) : rows;

  if (rows.length === 0) return <Empty title="No players yet" />;

  return (
    <Card className="overflow-hidden">
      <ol className="divide-y divide-line">
        {shown.map((row, i) => {
          const player = players.get(row.playerId)!;
          const s = row.stats;
          const week = ratingChangeSince(ratings, row.playerId, mode, since);
          const firstUnranked = row.rank === null && (i === 0 || shown[i - 1].rank !== null);
          return (
            <li key={row.playerId}>
              {firstUnranked && (
                <div className="bg-surface-2/60 px-4 py-1.5 text-xs text-muted">
                  Unranked: fewer than {config.minMatchesRanked} {mode} matches
                </div>
              )}
              <Link href={`/players/${row.playerId}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60">
                <span
                  className={cx(
                    "tabular w-6 text-center text-sm font-bold",
                    row.rank === 1 ? "text-ball-fg" : "text-muted",
                    row.rank === 1 && "rounded-md bg-ball",
                  )}
                >
                  {row.rank ?? "–"}
                </span>
                <Avatar name={player.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{player.name}</span>
                    {row.provisional && s.matches > 0 && <Badge className="hidden sm:inline-flex">Provisional</Badge>}
                    {!player.is_active && <Badge>Inactive</Badge>}
                    {s.streak >= 3 && <Badge tone="ball">{s.streak}W streak</Badge>}
                  </div>
                  <div className="text-xs text-muted">
                    {s.matches === 0 ? "No matches yet" : `${s.wins}–${s.losses} · ${fmt.winRate(s.wins, s.matches)}`}
                  </div>
                </div>
                <Sparkline values={s.history.slice(-12).map((p) => p.rating)} className="hidden sm:block" />
                <div className="w-16 text-right">
                  <div className="tabular text-lg font-bold">{fmt.rating(s.rating)}</div>
                  {Math.round(week) !== 0 && (
                    <div className="text-xs">
                      <Delta value={week} /> <span className="text-muted">7d</span>
                    </div>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
