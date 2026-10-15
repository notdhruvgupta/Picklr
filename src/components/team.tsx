"use client";

/** Team-tournament pieces: caps per player, the lineup picker, team labels. */

import { useState } from "react";
import { completeMatch, friendlyError, setLineup } from "@/lib/data/actions";
import { useData } from "@/lib/data/store";
import type { EloSegment, GameResult, Team } from "@/lib/elo";
import { isGameWon, validateFinalGames, type Lineup } from "@/lib/scoring";
import { allowedPairs, playerCaps, teamMatchCount, teamUsage, type TeamMatchView } from "@/lib/team-tournament";
import type { Match, Tournament, TournamentEntry } from "@/lib/types";
import { Badge, Button, Card, ErrorNote, Field, Input, cx } from "./ui";

const toView = (m: Match): TeamMatchView => ({
  id: m.id,
  entryA: m.entry_a_id,
  entryB: m.entry_b_id,
  teamA: m.team_a,
  teamB: m.team_b,
  void: m.status === "void",
});

/** Group-stage facts for a team tournament. */
export function useTeamTournament(tournamentId: string | null) {
  const { tournaments, entries, matches } = useData();
  const t = tournamentId ? tournaments.get(tournamentId) : undefined;
  const teamEntries = [...entries.values()].filter((e) => e.tournament_id === tournamentId).sort((a, b) => a.seed - b.seed);
  const group = [...matches.values()].filter((m) => m.tournament_id === tournamentId && m.stage === "group");
  const views = group.map(toView);
  const teamMatches = t ? teamMatchCount(teamEntries.length, t.round_robin_cycles) : 0;

  /** Each player's lineups so far (played or lined up) and played (finished), against their caps. */
  const usageFor = (entry: TournamentEntry, exceptMatchId?: string) => {
    const caps = playerCaps(entry.player_ids.length, teamMatches);
    const { counts, withoutLineup } = teamUsage(entry.id, views, exceptMatchId);
    const played = new Map<string, number>();
    for (const m of group) {
      if (m.status !== "completed") continue;
      const lineup = m.entry_a_id === entry.id ? m.team_a : m.entry_b_id === entry.id ? m.team_b : [];
      for (const id of lineup) played.set(id, (played.get(id) ?? 0) + 1);
    }
    return { caps, counts, withoutLineup, played };
  };

  return { tournament: t, entries: teamEntries, group, teamMatches, usageFor };
}

export const isTeamTournament = (t: Tournament | undefined) => t?.format === "team_round_robin";

/** Per-player match caps for one team: "2 played · 1 left (max 3)". */
export function TeamCaps({ entry, tournamentId }: { entry: TournamentEntry; tournamentId: string }) {
  const { players } = useData();
  const { usageFor } = useTeamTournament(tournamentId);
  const { caps, counts, played } = usageFor(entry);
  return (
    <ul className="space-y-1 text-sm">
      {entry.player_ids.map((id) => {
        const p = played.get(id) ?? 0;
        const lined = counts.get(id) ?? 0;
        const left = caps.max - p;
        return (
          <li key={id} className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{players.get(id)?.name ?? "?"}</span>
            <span className="tabular shrink-0 text-xs text-muted">
              {p} played · <span className={cx(left === 0 && "font-semibold text-text")}>{left} left</span> (max {caps.max}
              {caps.min !== caps.max ? `, min ${caps.min}` : ""}){lined > p ? ` · ${lined - p} lined up` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const pairKey = (pair: string[]) => [...pair].sort().join("|");

function SidePicker({
  match,
  entry,
  team,
  value,
  onChange,
  isFinal,
}: {
  match: Match;
  entry: TournamentEntry;
  team: Team;
  value: string[];
  onChange: (pair: string[]) => void;
  isFinal: boolean;
}) {
  const { players } = useData();
  const { usageFor } = useTeamTournament(match.tournament_id);
  const name = (id: string) => players.get(id)?.name ?? "?";
  const roster = entry.player_ids;
  const { caps, counts, withoutLineup } = usageFor(entry, match.id);
  const allowed = isFinal ? null : new Set(allowedPairs(roster, counts, withoutLineup, caps).map(pairKey));

  const pairs: string[][] = [];
  for (let i = 0; i < roster.length; i++) for (let j = i + 1; j < roster.length; j++) pairs.push([roster[i], roster[j]]);

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center gap-2">
        <span className={cx("h-4 w-1.5 rounded-full", team === "A" ? "bg-team-a" : "bg-team-b")} aria-hidden />
        <span className="font-semibold">{entry.name ?? `Team ${entry.seed}`}</span>
      </div>
      {!isFinal && (
        <ul className="space-y-0.5 text-xs text-muted">
          {roster.map((id) => {
            const c = counts.get(id) ?? 0;
            return (
              <li key={id} className="flex justify-between gap-2">
                <span>{name(id)}</span>
                <span className="tabular">
                  {c} of max {caps.max}
                  {c >= caps.max ? " · full" : caps.min > c ? ` · needs ${caps.min - c}+` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div role="radiogroup" aria-label={`${entry.name ?? "Team"} lineup`} className="grid gap-2">
        {pairs.map((pair) => {
          const ok = !allowed || allowed.has(pairKey(pair));
          const selected = pairKey(pair) === pairKey(value);
          return (
            <button
              key={pairKey(pair)}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!ok}
              onClick={() => onChange(pair)}
              className={cx(
                "flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                selected ? (team === "A" ? "border-team-a bg-team-a/10" : "border-team-b bg-team-b/10") : "border-line bg-surface hover:bg-surface-2",
                !ok && "cursor-not-allowed opacity-40 hover:bg-surface",
              )}
            >
              <span>
                {name(pair[0])} & {name(pair[1])}
              </span>
              {!ok && <span className="text-xs font-normal">breaks fair share</span>}
              {isFinal && roster.length - 2 > 0 && selected && (
                <span className="text-xs font-normal text-muted">
                  bench: {roster.filter((id) => !pair.includes(id)).map(name).join(", ")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Pick which 2 players each team fields. Both captains tell the referee, who
 * enters both. In the group stage only fair-share pairs are offered (the
 * database enforces the same rule); in the final any pair can start.
 */
export function LineupPicker({ match, onDone, onCancel }: { match: Match; onDone?: () => void; onCancel?: () => void }) {
  const { entries } = useData();
  const [a, setA] = useState<string[]>(match.team_a.length === 2 ? match.team_a : []);
  const [b, setB] = useState<string[]>(match.team_b.length === 2 ? match.team_b : []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const entryA = match.entry_a_id ? entries.get(match.entry_a_id) : undefined;
  const entryB = match.entry_b_id ? entries.get(match.entry_b_id) : undefined;
  const isFinal = match.stage === "playoff";

  if (!entryA || !entryB) return null;
  const unchanged = pairKey(a) === pairKey(match.team_a) && pairKey(b) === pairKey(match.team_b);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await setLineup(match.id, a, b);
      onDone?.();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{isFinal ? "Starting lineups for the final" : "Lineups"}</h2>
        <p className="text-sm text-muted">
          {isFinal
            ? `Each team starts with 2 players. When the first team reaches ${match.sub_threshold}, both teams bring on their bench player, and that team chooses who goes off on both sides.`
            : "Ask both captains which pair they're fielding. Only pairs that keep everyone's share of matches fair can be picked."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SidePicker match={match} entry={entryA} team="A" value={a} onChange={setA} isFinal={isFinal} />
        <SidePicker match={match} entry={entryB} team="B" value={b} onChange={setB} isFinal={isFinal} />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" disabled={a.length !== 2 || b.length !== 2 || busy || (unchanged && match.team_a.length > 0)} onClick={save}>
          {busy ? "Saving…" : "Save lineups"}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="lg" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        {isFinal && <Badge>Final · not counted toward caps</Badge>}
      </div>
    </div>
  );
}

/**
 * Team final substitution: the first team to reach the threshold (`leader`)
 * chooses who goes off for both teams; each team's bench player comes on (a
 * 4-player team picks which of its two bench players).
 */
export function SubstitutionChooser({
  match,
  court,
  leader,
  onConfirm,
  confirmLabel = "Make substitution",
  compact = false,
}: {
  match: Match;
  court: Lineup;
  leader: Team | null;
  onConfirm: (lineup: Lineup) => void;
  confirmLabel?: string;
  compact?: boolean;
}) {
  const { entries, players } = useData();
  const name = (id: string) => players.get(id)?.name ?? "?";
  const entryOf = (t: Team) => entries.get((t === "A" ? match.entry_a_id : match.entry_b_id) ?? "");
  const teamName = (t: Team) => entryOf(t)?.name ?? `Team ${t}`;
  const bench = (t: Team) => (entryOf(t)?.player_ids ?? []).filter((id) => !court[t].includes(id));
  const [out, setOut] = useState<Record<Team, string | null>>({ A: null, B: null });
  const [inn, setInn] = useState<Record<Team, string | null>>({
    A: bench("A").length === 1 ? bench("A")[0] : null,
    B: bench("B").length === 1 ? bench("B")[0] : null,
  });
  const ready = out.A && out.B && inn.A && inn.B;

  const choice = (label: string, options: string[], value: string | null, set: (id: string) => void) => (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
        {options.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => set(id)}
            className={cx(
              "rounded-xl border-2 px-3 py-2.5 text-sm font-semibold",
              value === id ? "border-ball bg-ball/20" : "border-line bg-surface hover:bg-surface-2",
            )}
          >
            {name(id)}
          </button>
        ))}
      </div>
    </div>
  );

  const picker = leader ? `${teamName(leader)} picks` : "picked by the team that reached it first";
  return (
    <div className={cx("space-y-4", !compact && "rounded-2xl border-2 border-ball bg-surface p-4 shadow-card")}>
      {!compact && (
        <div>
          <p className="text-lg font-bold">Substitution</p>
          <p className="text-sm text-muted">
            <span className="font-semibold text-text">{leader ? teamName(leader) : "A team"}</span> reached {match.sub_threshold} first, so they
            choose who goes off for both teams. Each team&apos;s bench player comes on.
          </p>
        </div>
      )}
      {(["A", "B"] as const).map((t) => (
        <div key={t} className="space-y-3 rounded-xl bg-surface-2/60 p-3">
          <p className="flex items-center gap-2 font-semibold">
            <span className={cx("h-4 w-1.5 rounded-full", t === "A" ? "bg-team-a" : "bg-team-b")} aria-hidden />
            {teamName(t)}
          </p>
          {choice(`Goes off · ${picker}`, court[t], out[t], (id) => setOut({ ...out, [t]: id }))}
          {bench(t).length > 1 ? (
            choice(`Comes on · ${teamName(t)} picks`, bench(t), inn[t], (id) => setInn({ ...inn, [t]: id }))
          ) : (
            <p className="text-sm">
              Comes on: <span className="font-semibold">{inn[t] ? name(inn[t]) : "–"}</span>
            </p>
          )}
        </div>
      ))}
      <Button
        size="lg"
        className="w-full"
        disabled={!ready}
        onClick={() =>
          onConfirm({
            A: [...court.A.filter((id) => id !== out.A), inn.A!],
            B: [...court.B.filter((id) => id !== out.B), inn.B!],
          })
        }
      >
        {confirmLabel}
      </Button>
    </div>
  );
}

const num = (v: string) => (v === "" ? NaN : Number(v));

/**
 * Enter (or correct) a team final's result without live scoring: the score
 * when the first team reached the threshold, the substitution, and the final
 * score. Saved as two rated segments, like a live-scored final.
 */
export function FinalResultForm({ match, onDone, onCancel }: { match: Match; onDone: () => void; onCancel?: () => void }) {
  const { players } = useData();
  const existing = match.segments?.length === 2 ? match.segments : null;
  const start: Lineup = existing ? { A: existing[0].teamA, B: existing[0].teamB } : { A: match.team_a, B: match.team_b };
  const threshold = match.sub_threshold ?? 10;
  const [subA, setSubA] = useState(existing ? String(existing[0].pointsA) : "");
  const [subB, setSubB] = useState(existing ? String(existing[0].pointsB) : "");
  const [second, setSecond] = useState<Lineup | null>(existing ? { A: existing[1].teamA, B: existing[1].teamB } : null);
  const [finalA, setFinalA] = useState(existing ? String(match.games[0]?.a ?? "") : "");
  const [finalB, setFinalB] = useState(existing ? String(match.games[0]?.b ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = (id: string) => players.get(id)?.name ?? "?";

  const sa = num(subA);
  const sb = num(subB);
  const subValid = Number.isInteger(sa) && Number.isInteger(sb) && Math.max(sa, sb) === threshold && Math.min(sa, sb) < threshold && Math.min(sa, sb) >= 0;
  const leader: Team | null = subValid ? (sa > sb ? "A" : "B") : null;

  const save = async () => {
    const fa = num(finalA);
    const fb = num(finalB);
    if (!subValid) return setError(`At the substitution one team has exactly ${threshold} and the other fewer.`);
    if (!second) return setError("Pick who went off and who came on.");
    const game: GameResult = { a: fa, b: fb };
    const problem = validateFinalGames([game], { mode: "doubles", scoring: match.scoring, pointsToWin: match.points_to_win, winBy: match.win_by, bestOf: 1 });
    if (problem) return setError(problem);
    if (fa < sa || fb < sb || !isGameWon(game, { mode: "doubles", scoring: match.scoring, pointsToWin: match.points_to_win, winBy: match.win_by, bestOf: 1 })) {
      return setError("The final score must be at least the score at the substitution.");
    }
    const segments: EloSegment[] = [
      { teamA: start.A, teamB: start.B, pointsA: sa, pointsB: sb },
      { teamA: second.A, teamB: second.B, pointsA: fa - sa, pointsB: fb - sb },
    ];
    setBusy(true);
    setError(null);
    try {
      await completeMatch(match.id, [game], undefined, segments);
      onDone();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const scoreInputs = (label: string, a: string, b: string, setA: (v: string) => void, setB: (v: string) => void, id: string) => (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <Input id={`${id}-a`} aria-label={`${label}: team A`} inputMode="numeric" className="tabular w-20 text-center text-lg font-bold" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ""))} />
        <span className="text-muted">–</span>
        <Input id={`${id}-b`} aria-label={`${label}: team B`} inputMode="numeric" className="tabular w-20 text-center text-lg font-bold" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ""))} />
      </div>
    </Field>
  );

  return (
    <Card className="space-y-4 border-primary/50 p-4">
      <div>
        <h2 className="font-semibold">Final result</h2>
        <p className="text-sm text-muted">
          Started: {start.A.map(name).join(" & ")} vs {start.B.map(name).join(" & ")}. The final is rated in two parts, split at the substitution.
        </p>
      </div>
      {scoreInputs(`Score when a team reached ${threshold}`, subA, subB, setSubA, setSubB, "sub")}
      {subValid && !second && (
        <SubstitutionChooser match={match} court={start} leader={leader} onConfirm={setSecond} confirmLabel="Use this substitution" compact />
      )}
      {second && (
        <p className="text-sm">
          After the substitution: <span className="font-semibold">{second.A.map(name).join(" & ")}</span> vs{" "}
          <span className="font-semibold">{second.B.map(name).join(" & ")}</span>{" "}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setSecond(null)}>
            Change
          </button>
        </p>
      )}
      {scoreInputs("Final score", finalA, finalB, setFinalA, setFinalB, "final")}
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy || !second}>
          {busy ? "Saving…" : "Save result"}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
}
