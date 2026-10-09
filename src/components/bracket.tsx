"use client";

import Link from "next/link";
import type { Team } from "@/lib/elo";
import { useData } from "@/lib/data/store";
import type { Match, TournamentEntry } from "@/lib/types";
import { TeamNames } from "./bits";
import { cx } from "./ui";

function Slot({ match, team, entry }: { match: Match; team: Team; entry: TournamentEntry | undefined }) {
  const ids = team === "A" ? match.team_a : match.team_b;
  const won = match.status === "completed" && match.winner === team;
  const lost = match.status === "completed" && match.winner !== team;
  const live = match.status === "live" ? (team === "A" ? match.live_state?.current.a : match.live_state?.current.b) : undefined;
  return (
    <div className={cx("flex items-center gap-2 px-2.5 py-1.5", won && "font-semibold", lost && "text-muted")}>
      <span className="tabular w-4 text-[10px] text-muted">{entry?.seed ?? ""}</span>
      <span className="min-w-0 flex-1 truncate text-sm">
        <TeamNames ids={ids} link={false} />
      </span>
      <span className="tabular text-sm">
        {match.status === "completed" ? match.games.map((g) => (team === "A" ? g.a : g.b)).join(" ") : live ?? ""}
      </span>
    </div>
  );
}

export function BracketMatchCard({ match }: { match: Match }) {
  const { entries } = useData();
  const a = match.entry_a_id ? entries.get(match.entry_a_id) : undefined;
  const b = match.entry_b_id ? entries.get(match.entry_b_id) : undefined;
  const pending = match.is_conditional && match.status === "scheduled" && match.team_a.length === 0;
  return (
    <Link
      href={`/matches/${match.id}`}
      className={cx(
        "block w-56 overflow-hidden rounded-xl border bg-surface text-left shadow-card transition-shadow hover:shadow-lg",
        match.status === "live" ? "border-live ring-1 ring-live/40" : "border-line",
        match.status === "void" && "opacity-50",
      )}
    >
      <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-2.5 py-1 text-[11px] font-semibold text-muted">
        <span className="truncate">{match.bracket_label}</span>
        {match.status === "live" && <span className="text-live">LIVE</span>}
        {match.status === "void" && <span>Not played</span>}
        {pending && <span>If needed</span>}
      </div>
      <Slot match={match} team="A" entry={a} />
      <div className="border-t border-line" />
      <Slot match={match} team="B" entry={b} />
    </Link>
  );
}

/** Columns of matches by round for one bracket section. */
function Rounds({ matches, title }: { matches: Match[]; title?: string }) {
  const rounds = new Map<number, Match[]>();
  for (const m of matches) rounds.set(m.bracket_round ?? 0, [...(rounds.get(m.bracket_round ?? 0) ?? []), m]);
  const ordered = [...rounds.entries()].sort(([x], [y]) => x - y);
  return (
    <div>
      {title && <h3 className="mb-2 text-sm font-semibold text-muted">{title}</h3>}
      <div className="flex gap-4">
        {ordered.map(([round, list]) => (
          <div key={round} className="flex flex-col justify-around gap-3">
            {list
              .sort((x, y) => (x.bracket_key ?? "").localeCompare(y.bracket_key ?? "", undefined, { numeric: true }))
              .map((m) => (
                <BracketMatchCard key={m.id} match={m} />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Bracket({ matches }: { matches: Match[] }) {
  const key = (m: Match) => (m.bracket_key ?? "").replace(/^P-/, "");
  const winners = matches.filter((m) => key(m).startsWith("W"));
  const losers = matches.filter((m) => key(m).startsWith("L"));
  const final = matches.filter((m) => key(m).startsWith("GF"));
  const double = losers.length > 0 || final.length > 0;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="w-max space-y-8">
        <Rounds matches={winners} title={double ? "Winners bracket" : undefined} />
        {losers.length > 0 && <Rounds matches={losers} title="Losers bracket" />}
        {final.length > 0 && <Rounds matches={final} title="Grand final" />}
      </div>
    </div>
  );
}
