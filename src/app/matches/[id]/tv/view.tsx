"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { BallIcon } from "@/components/bits";
import { Scoreboard, formatLabel } from "@/components/match";
import { LiveBadge } from "@/components/ui";
import { liveMatches } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";

/** Full-screen scoreboard for a phone propped by the court or a TV. */
export function TvView() {
  const { id } = useParams<{ id: string }>();
  const { matches, status, settings } = useData();
  const match = matches.get(id);
  // When this match finishes, follow the next live match automatically.
  const next = match && match.status !== "live" ? liveMatches(matches)[0] : undefined;
  const shown = next ?? match;

  useEffect(() => {
    // Keep the screen on while the scoreboard is showing, where supported.
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => void lock?.release();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg p-6 sm:p-10">
      <div className="flex items-center justify-between text-muted">
        <span className="flex items-center gap-3 text-xl font-bold text-text">
          <BallIcon className="size-8" /> {settings?.group_name ?? "Picklr"}
        </span>
        <span className="flex items-center gap-3">
          {shown?.status === "live" && <LiveBadge />}
          <Link href={shown ? `/matches/${shown.id}` : "/"} className="text-sm hover:text-text">
            Exit
          </Link>
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center">
        {status !== "ready" ? null : shown ? (
          <>
            <p className="mb-6 text-center text-2xl text-muted">{shown.bracket_label ?? formatLabel(shown)}</p>
            <Scoreboard match={shown} size="xl" links={false} />
          </>
        ) : (
          <p className="text-center text-3xl text-muted">Match not found</p>
        )}
      </div>
    </div>
  );
}
