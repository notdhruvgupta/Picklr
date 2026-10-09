"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useData } from "@/lib/data/store";
import * as fmt from "@/lib/format";
import { cx } from "./ui";

const AVATAR_COLORS = ["#0f766e", "#7c3aed", "#b45309", "#be123c", "#1d4ed8", "#15803d", "#a21caf", "#0e7490", "#c2410c", "#4d7c0f"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sizes = { sm: "size-7 text-[11px]", md: "size-9 text-sm", lg: "size-12 text-base", xl: "size-16 text-xl" };
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white", sizes[size], className)}
      style={{ background: AVATAR_COLORS[hash(name) % AVATAR_COLORS.length] }}
    >
      {initials}
    </span>
  );
}

export function Delta({ value, className }: { value: number; className?: string }) {
  const r = Math.round(value);
  return (
    <span className={cx("tabular font-semibold", r > 0 ? "text-win" : r < 0 ? "text-loss" : "text-muted", className)}>
      {fmt.delta(value)}
    </span>
  );
}

/** Linked player names: "Dhruv & Tarang" for a team, "A, B and C" when `list` is set. */
export function TeamNames({ ids, className, link = true, list = false }: { ids: string[]; className?: string; link?: boolean; list?: boolean }) {
  const { players } = useData();
  if (ids.length === 0) return <span className={cx("text-muted italic", className)}>TBD</span>;
  return (
    <span className={className}>
      {ids.map((id, i) => {
        const name = players.get(id)?.name ?? "Unknown";
        return (
          <span key={id}>
            {i > 0 && <span className="text-muted">{!list ? " & " : i === ids.length - 1 ? " and " : ", "}</span>}
            {link ? (
              <Link href={`/players/${id}`} className="hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
          </span>
        );
      })}
    </span>
  );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return <span className={cx("inline-block h-6 w-20", className)} />;
  const w = 80;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cx("h-6 w-20", className)} aria-hidden>
      <polyline points={points} fill="none" stroke={up ? "var(--win)" : "var(--loss)"} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="tabular mt-0.5 text-lg font-bold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function BallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14" fill="var(--ball)" />
      {[
        [11, 9],
        [19, 8],
        [8, 16],
        [16, 15],
        [24, 15],
        [11, 23],
        [20, 22],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.9" fill="var(--ball-fg)" opacity="0.55" />
      ))}
    </svg>
  );
}
