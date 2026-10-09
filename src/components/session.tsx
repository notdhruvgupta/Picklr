"use client";

import Link from "next/link";
import { useState } from "react";
import { useData } from "@/lib/data/store";
import { matchTime } from "@/lib/data/selectors";
import * as fmt from "@/lib/format";
import { summarize } from "@/lib/stats";
import type { Match, PlaySession } from "@/lib/types";
import { Avatar, Delta } from "./bits";
import { ShareIcon } from "./icons";
import { Button, Card } from "./ui";

export function sessionMatches(matches: Map<string, Match>, sessionId: string): Match[] {
  return [...matches.values()]
    .filter((m) => m.session_id === sessionId && m.status !== "void")
    .sort((a, b) => matchTime(a).localeCompare(matchTime(b)));
}

export function useSessionSummary(session: PlaySession) {
  const { matches, ratings } = useData();
  const list = sessionMatches(matches, session.id);
  const completed = list.filter((m) => m.status === "completed");
  const lines = summarize(
    completed.filter((m) => m.is_rated).map((m) => m.id),
    ratings,
  );
  // Unrated matches still count toward the W–L record for the day.
  for (const m of completed.filter((x) => !x.is_rated && x.winner)) {
    for (const id of [...m.team_a, ...m.team_b]) {
      let line = lines.find((l) => l.playerId === id);
      if (!line) {
        line = { playerId: id, wins: 0, losses: 0, delta: 0 };
        lines.push(line);
      }
      const won = (m.winner === "A") === m.team_a.includes(id);
      if (won) line.wins++;
      else line.losses++;
    }
  }
  return { list, completed, lines };
}

export function SessionStandings({ session }: { session: PlaySession }) {
  const { players } = useData();
  const { lines } = useSessionSummary(session);
  if (lines.length === 0) return <p className="text-sm text-muted">No completed matches yet.</p>;
  return (
    <Card className="overflow-hidden">
      <ol className="divide-y divide-line">
        {lines.map((l, i) => {
          const p = players.get(l.playerId);
          return (
            <li key={l.playerId}>
              <Link href={`/players/${l.playerId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                <span className="tabular w-5 text-sm font-bold text-muted">{i + 1}</span>
                <Avatar name={p?.name ?? "?"} size="sm" />
                <span className="flex-1 font-semibold">
                  {p?.name}
                  {i === 0 && l.delta > 0 && <span className="ml-2 rounded-md bg-ball px-1.5 py-0.5 text-xs font-bold text-ball-fg">MVP</span>}
                </span>
                <span className="tabular text-sm text-muted">
                  {l.wins}–{l.losses}
                </span>
                <Delta value={l.delta} className="w-10 text-right text-sm" />
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Plain-text recap for pasting into a group chat. */
export function ShareRecap({ session }: { session: PlaySession }) {
  const { players, settings } = useData();
  const { completed, lines } = useSessionSummary(session);
  const [copied, setCopied] = useState(false);
  if (completed.length === 0) return null;

  const text = [
    `${settings?.group_name ?? "Pickleball"} · ${fmt.day(session.created_at)}`,
    `${completed.length} matches · ${lines.length} players`,
    "",
    ...lines.map((l, i) => {
      const d = Math.round(l.delta);
      return `${i + 1}. ${players.get(l.playerId)?.name} ${l.wins}–${l.losses} (${d >= 0 ? "+" : ""}${d})${i === 0 && d > 0 ? " 🏆" : ""}`;
    }),
    "",
    typeof window !== "undefined" ? `${window.location.origin}/sessions/${session.id}` : "",
  ].join("\n");

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      // Fall through to copying.
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; nothing else to do.
    }
  };

  return (
    <Button variant="secondary" size="sm" onClick={share}>
      <ShareIcon className="size-4" /> {copied ? "Copied!" : "Share recap"}
    </Button>
  );
}
