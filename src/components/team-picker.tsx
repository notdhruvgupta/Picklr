"use client";

import type { Mode, Team } from "@/lib/elo";
import { useData } from "@/lib/data/store";
import { playersByRating } from "@/lib/data/selectors";
import * as fmt from "@/lib/format";
import { cx } from "./ui";

export type Assignment = Record<string, Team>;

/**
 * Tap a player to put them on Team A, again for Team B, again to remove.
 * A full team is skipped automatically.
 */
export function TeamPicker({
  mode,
  value,
  onChange,
  only,
}: {
  mode: Mode;
  value: Assignment;
  onChange: (a: Assignment) => void;
  /** Restrict to these players (e.g. those checked in). */
  only?: string[];
}) {
  const { players, ratings } = useData();
  const perTeam = mode === "doubles" ? 2 : 1;
  const list = playersByRating(players, ratings, mode).filter((p) => !only || only.includes(p.id));
  const count = (team: Team) => Object.values(value).filter((t) => t === team).length;

  const tap = (id: string) => {
    const next = { ...value };
    const current = next[id];
    const order: (Team | undefined)[] = current === undefined ? ["A", "B", undefined] : current === "A" ? ["B", undefined] : [undefined];
    delete next[id];
    const target = order.find((t) => t === undefined || count(t) - (current === t ? 1 : 0) < perTeam);
    if (target) next[id] = target;
    onChange(next);
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {list.map((p) => {
        const team = value[p.id];
        const rating = ratings.players.get(p.id)?.[mode].rating;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => tap(p.id)}
            aria-pressed={team !== undefined}
            className={cx(
              "flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-colors",
              team === "A" && "border-team-a bg-team-a/10",
              team === "B" && "border-team-b bg-team-b/10",
              !team && "border-line bg-surface hover:bg-surface-2",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{p.name}</span>
              <span className="tabular text-xs text-muted">{rating !== undefined ? fmt.rating(rating) : ""}</span>
            </span>
            {team && (
              <span className={cx("rounded-md px-1.5 py-0.5 text-xs font-bold text-white", team === "A" ? "bg-team-a" : "bg-team-b")}>{team}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function teamsFrom(assignment: Assignment): { teamA: string[]; teamB: string[] } {
  const entries = Object.entries(assignment);
  return {
    teamA: entries.filter(([, t]) => t === "A").map(([id]) => id),
    teamB: entries.filter(([, t]) => t === "B").map(([id]) => id),
  };
}
