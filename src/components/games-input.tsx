"use client";

import type { GameResult } from "@/lib/elo";
import { Input, cx } from "./ui";

/** Score entry for up to `bestOf` games. Empty cells are allowed for games not played. */
export function GamesInput({
  games,
  bestOf,
  onChange,
  teamALabel,
  teamBLabel,
}: {
  games: (GameResult | null)[];
  bestOf: number;
  onChange: (games: (GameResult | null)[]) => void;
  teamALabel: string;
  teamBLabel: string;
}) {
  const rows = Array.from({ length: bestOf }, (_, i) => games[i] ?? null);
  const set = (i: number, side: "a" | "b", raw: string) => {
    const next = [...rows];
    const value = raw === "" ? null : Math.max(0, Math.min(99, Number.parseInt(raw, 10) || 0));
    const current = next[i] ?? { a: NaN, b: NaN };
    const updated = { ...current, [side]: value ?? NaN };
    next[i] = Number.isNaN(updated.a) && Number.isNaN(updated.b) ? null : updated;
    onChange(next);
  };
  const show = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? "" : String(v));

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className={cx("grid items-center gap-2 bg-surface-2 px-3 py-2 text-xs font-semibold text-muted", bestOf > 1 ? "grid-cols-[1fr_repeat(var(--n),3.5rem)]" : "grid-cols-[1fr_4.5rem]")} style={{ ["--n" as string]: bestOf }}>
        <span>Team</span>
        {rows.map((_, i) => (
          <span key={i} className="text-center">
            {bestOf > 1 ? `G${i + 1}` : "Points"}
          </span>
        ))}
      </div>
      {(["a", "b"] as const).map((side) => (
        <div
          key={side}
          className={cx("grid items-center gap-2 border-t border-line px-3 py-2", bestOf > 1 ? "grid-cols-[1fr_repeat(var(--n),3.5rem)]" : "grid-cols-[1fr_4.5rem]")}
          style={{ ["--n" as string]: bestOf }}
        >
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <span className={cx("h-4 w-1 shrink-0 rounded-full", side === "a" ? "bg-team-a" : "bg-team-b")} aria-hidden />
            <span className="truncate">{side === "a" ? teamALabel : teamBLabel}</span>
          </span>
          {rows.map((g, i) => (
            <Input
              key={i}
              inputMode="numeric"
              aria-label={`${side === "a" ? teamALabel : teamBLabel} game ${i + 1}`}
              className="tabular h-11 text-center text-lg font-bold"
              value={show(g?.[side])}
              onChange={(e) => set(i, side, e.target.value.replace(/\D/g, ""))}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Completed games from the editor, or null if any game is half-filled. */
export function filledGames(games: (GameResult | null)[]): GameResult[] | null {
  const out: GameResult[] = [];
  for (const g of games) {
    if (!g) continue;
    if (Number.isNaN(g.a) || Number.isNaN(g.b)) return null;
    out.push(g);
  }
  return out;
}
