export const rating = (r: number) => Math.round(r).toString();

export function delta(d: number): string {
  const rounded = Math.round(d);
  if (rounded === 0) return "±0";
  return rounded > 0 ? `+${rounded}` : `−${Math.abs(rounded)}`;
}

export const percent = (p: number) => `${Math.round(p * 100)}%`;

export const winRate = (wins: number, played: number) => (played === 0 ? "–" : percent(wins / played));

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const fullFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

export function day(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return dayFormat.format(d);
}

export const time = (iso: string) => timeFormat.format(new Date(iso));
export const date = (iso: string) => fullFormat.format(new Date(iso));

/** Local calendar date as YYYY-MM-DD. */
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function gamesScore(games: { a: number; b: number }[]): string {
  return games.map((g) => `${g.a}–${g.b}`).join(", ");
}
