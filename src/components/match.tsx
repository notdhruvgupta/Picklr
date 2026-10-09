"use client";

import Link from "next/link";
import type { Team } from "@/lib/elo";
import { useData } from "@/lib/data/store";
import { matchTime } from "@/lib/data/selectors";
import * as fmt from "@/lib/format";
import { gameWins, initialState, scoreCall, type LiveState, type MatchFormat } from "@/lib/scoring";
import type { Match } from "@/lib/types";
import { BallIcon, Delta, TeamNames } from "./bits";
import { Badge, Card, LiveBadge, cx } from "./ui";

export function formatOf(m: Pick<Match, "mode" | "scoring" | "points_to_win" | "win_by" | "best_of">): MatchFormat {
  return { mode: m.mode, scoring: m.scoring, pointsToWin: m.points_to_win, winBy: m.win_by, bestOf: m.best_of };
}

export function liveStateOf(m: Match): LiveState {
  return m.live_state ?? initialState(formatOf(m), m.first_server);
}

export function formatLabel(m: Pick<Match, "mode" | "scoring" | "points_to_win" | "best_of">): string {
  const parts = [m.mode === "doubles" ? "Doubles" : "Singles", `${m.scoring === "rally" ? "Rally" : "Side-out"} to ${m.points_to_win}`];
  if (m.best_of > 1) parts.push(`best of ${m.best_of}`);
  return parts.join(" · ");
}

/** Average rating change for a team in a completed rated match. */
function useTeamDelta(match: Match, team: Team): number | null {
  const { ratings } = useData();
  const info = ratings.byMatch.get(match.id);
  if (!info) return null;
  const changes = info.changes.filter((c) => c.team === team);
  return changes.reduce((s, c) => s + c.delta, 0) / changes.length;
}

function TeamLine({ match, team }: { match: Match; team: Team }) {
  const ids = team === "A" ? match.team_a : match.team_b;
  const won = match.winner === team;
  const d = useTeamDelta(match, team);
  const points = match.games.map((g) => (team === "A" ? g.a : g.b));
  return (
    <div className="flex items-center gap-3">
      <span className={cx("min-w-0 flex-1 truncate", won ? "font-semibold" : "text-muted")}>
        <TeamNames ids={ids} link={false} />
      </span>
      {d !== null && <Delta value={d} className="w-9 text-right text-xs" />}
      <span className="flex gap-2">
        {points.map((p, i) => (
          <span key={i} className={cx("tabular w-6 text-right text-lg", won ? "font-bold" : "text-muted")}>
            {p}
          </span>
        ))}
      </span>
    </div>
  );
}

export function MatchRow({ match, showDate = true }: { match: Match; showDate?: boolean }) {
  const { ratings, tournaments } = useData();
  const info = ratings.byMatch.get(match.id);
  const tournament = match.tournament_id ? tournaments.get(match.tournament_id) : null;
  const upset = info && (info.winner === "A" ? info.expectedA : 1 - info.expectedA) < 0.35;
  return (
    <Link href={`/matches/${match.id}`} className="block px-4 py-3 transition-colors hover:bg-surface-2/60">
      <div className="space-y-1">
        <TeamLine match={match} team="A" />
        <TeamLine match={match} team="B" />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        {showDate && <span>{fmt.day(matchTime(match))}</span>}
        <span>{formatLabel(match)}</span>
        {tournament && <span className="truncate">· {match.bracket_label ?? tournament.name}</span>}
        {!match.is_rated && <Badge>Unrated</Badge>}
        {upset && <Badge tone="ball">Upset</Badge>}
      </div>
    </Link>
  );
}

export function MatchList({ matches, showDate = true }: { matches: Match[]; showDate?: boolean }) {
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {matches.map((m) => (
        <MatchRow key={m.id} match={m} showDate={showDate} />
      ))}
    </Card>
  );
}

/** Pre-match win probability for team A, from current ratings. */
export function useWinChance(match: Match): number | null {
  const { ratings, players, config } = useData();
  if (match.team_a.length === 0 || match.team_b.length === 0) return null;
  const info = ratings.byMatch.get(match.id);
  if (info) return info.expectedA;
  const r = (id: string) => {
    const p = players.get(id);
    return ratings.players.get(id)?.[match.mode].rating ?? (match.mode === "singles" ? p?.initial_singles : p?.initial_doubles) ?? config.baseRating;
  };
  const avg = (ids: string[]) => ids.reduce((s, id) => s + r(id), 0) / ids.length;
  return 1 / (1 + Math.pow(10, (avg(match.team_b) - avg(match.team_a)) / 400));
}

function ScoreSide({
  match,
  team,
  state,
  size,
  links,
}: {
  match: Match;
  team: Team;
  state: LiveState;
  size: "md" | "xl";
  links: boolean;
}) {
  const ids = team === "A" ? match.team_a : match.team_b;
  const serving = match.status === "live" && !state.winner && state.servingTeam === team;
  const score = team === "A" ? state.current.a : state.current.b;
  const games = gameWins(state.games)[team];
  const won = (match.status === "completed" && match.winner === team) || state.winner === team;
  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-xl px-3 py-2",
        serving && "bg-ball/15 ring-1 ring-ball/60",
        size === "xl" && "gap-6 px-6 py-5",
      )}
    >
      <span className={cx("w-1.5 self-stretch rounded-full", team === "A" ? "bg-team-a" : "bg-team-b")} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className={cx("truncate font-semibold", size === "xl" ? "text-4xl sm:text-6xl" : "text-base")}>
          <TeamNames ids={ids} link={links} />
        </div>
        <div className={cx("flex items-center gap-2 text-muted", size === "xl" ? "mt-2 text-2xl" : "text-xs")}>
          {serving && (
            <span className="flex items-center gap-1 font-semibold text-text">
              <BallIcon className={size === "xl" ? "size-7" : "size-3.5"} />
              Serving{match.mode === "doubles" && match.scoring === "sideout" ? ` · server ${state.serverNumber}` : ""}
            </span>
          )}
          {won && <span className="font-semibold text-win">Winner</span>}
          {match.best_of > 1 && <span>Games {games}</span>}
        </div>
      </div>
      {match.status === "live" && !state.winner && (
        <span key={score} className={cx("score-pop tabular font-bold", size === "xl" ? "text-[9rem] leading-none sm:text-[12rem]" : "text-4xl")}>
          {score}
        </span>
      )}
    </div>
  );
}

/** Live (or finished) scoreboard for a match. */
export function Scoreboard({ match, size = "md", links = true }: { match: Match; size?: "md" | "xl"; links?: boolean }) {
  const state = liveStateOf(match);
  const format = formatOf(match);
  const finished = match.status === "completed";
  return (
    <div className={cx("space-y-2", size === "xl" && "space-y-6")}>
      <ScoreSide match={match} team="A" state={state} size={size} links={links} />
      <ScoreSide match={match} team="B" state={state} size={size} links={links} />
      {match.status === "live" && !state.winner && (
        <p className={cx("text-center text-muted", size === "xl" ? "text-3xl" : "text-sm")}>
          Score call <span className="tabular font-bold text-text">{scoreCall(state, format)}</span>
          {state.games.length > 0 && <span> · Game {state.games.length + 1}</span>}
        </p>
      )}
      {(finished || state.winner) && match.games.length > 0 && (
        <p className={cx("text-center font-semibold", size === "xl" ? "text-4xl" : "text-sm")}>{fmt.gamesScore(match.games)}</p>
      )}
    </div>
  );
}

export function LiveMatchCard({ match }: { match: Match }) {
  const chance = useWinChance(match);
  return (
    <Link href={`/matches/${match.id}`} className="block">
      <Card className="p-3 transition-shadow hover:shadow-lg">
        <div className="mb-2 flex items-center justify-between px-1">
          <LiveBadge />
          <span className="text-xs text-muted">{formatLabel(match)}</span>
        </div>
        <Scoreboard match={match} links={false} />
        {chance !== null && <WinChanceBar chance={chance} className="mt-3 px-1" />}
      </Card>
    </Link>
  );
}

export function WinChanceBar({ chance, className }: { chance: number; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{fmt.percent(chance)} win chance</span>
        <span>{fmt.percent(1 - chance)}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="bg-team-a" style={{ width: `${chance * 100}%` }} />
        <div className="flex-1 bg-team-b" />
      </div>
    </div>
  );
}

export function UpcomingRow({ match, index }: { match: Match; index?: number }) {
  const chance = useWinChance(match);
  return (
    <Link href={`/matches/${match.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
      {index !== undefined && <span className="tabular w-5 text-sm font-bold text-muted">{index + 1}</span>}
      <div className="min-w-0 flex-1 text-sm">
        <div className="truncate">
          <TeamNames ids={match.team_a} link={false} /> <span className="text-muted">vs</span> <TeamNames ids={match.team_b} link={false} />
        </div>
        <div className="text-xs text-muted">{match.bracket_label ?? formatLabel(match)}</div>
      </div>
      {chance !== null && <span className="tabular text-xs text-muted">{fmt.percent(chance)}</span>}
    </Link>
  );
}
