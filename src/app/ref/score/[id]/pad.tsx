"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BallIcon, Delta, TeamNames } from "@/components/bits";
import { UndoIcon } from "@/components/icons";
import { formatLabel, formatOf } from "@/components/match";
import { Badge, Button, ButtonLink, Card, Empty, ErrorNote, Field, Input, Segmented, Spinner, cx } from "@/components/ui";
import {
  completeMatch,
  fetchRallies,
  friendlyError,
  recordRally,
  resetMatch,
  startMatch,
  undoRally,
} from "@/lib/data/actions";
import { teamLabel, upcomingMatches } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import { previewMatch, type Team } from "@/lib/elo";
import * as fmt from "@/lib/format";
import { gameWins, isGameWon, other, replay, scoreCall, type RallyEvent } from "@/lib/scoring";
import type { Match } from "@/lib/types";

function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = () =>
      navigator.wakeLock
        ?.request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);
}

function StartPanel({ match }: { match: Match }) {
  const { ratings, config } = useData();
  const [server, setServer] = useState<Team>("A");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stats = (id: string) => ratings.players.get(id)?.[match.mode] ?? { rating: config.baseRating, matches: 0 };
  const preview = previewMatch(match.team_a.map(stats), match.team_b.map(stats), config);

  return (
    <Card className="space-y-5 p-5">
      <div className="space-y-1 text-center">
        <p className="text-sm text-muted">{formatLabel(match)}</p>
        <p className="text-lg font-semibold">
          <TeamNames ids={match.team_a} link={false} /> <span className="text-muted">vs</span> <TeamNames ids={match.team_b} link={false} />
        </p>
        <p className="text-sm text-muted">
          {fmt.percent(preview.expectedA)} – {fmt.percent(1 - preview.expectedA)} · at stake about{" "}
          <Delta value={preview.ifAWins[0]} /> / <Delta value={preview.ifBWins[0]} />
        </p>
      </div>
      <Field label="Who serves first?">
        <Segmented
          label="First server"
          value={server}
          onChange={setServer}
          className="w-full"
          options={[
            { value: "A", label: <TeamNames ids={match.team_a} link={false} /> },
            { value: "B", label: <TeamNames ids={match.team_b} link={false} /> },
          ]}
        />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <Button
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await startMatch(match, server, formatOf(match));
          } catch (err) {
            setError(friendlyError(err));
            setBusy(false);
          }
        }}
      >
        Start match
      </Button>
    </Card>
  );
}

function CorrectionForm({
  current,
  onSubmit,
  onCancel,
  doublesSideout,
}: {
  current: { a: number; b: number; servingTeam: Team; serverNumber: 1 | 2 };
  onSubmit: (e: RallyEvent) => void;
  onCancel: () => void;
  doublesSideout: boolean;
}) {
  const [a, setA] = useState(String(current.a));
  const [b, setB] = useState(String(current.b));
  const [serving, setServing] = useState<Team>(current.servingTeam);
  const [server, setServer] = useState<"1" | "2">(String(current.serverNumber) as "1" | "2");
  return (
    <Card className="space-y-4 p-4">
      <p className="font-semibold">Correct the score</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Team A points" htmlFor="fix-a">
          <Input id="fix-a" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Team B points" htmlFor="fix-b">
          <Input id="fix-b" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ""))} />
        </Field>
      </div>
      <Field label="Serving">
        <Segmented label="Serving team" value={serving} onChange={setServing} options={[{ value: "A", label: "Team A" }, { value: "B", label: "Team B" }]} />
      </Field>
      {doublesSideout && (
        <Field label="Server">
          <Segmented label="Server number" value={server} onChange={setServer} options={[{ value: "1", label: "1st" }, { value: "2", label: "2nd" }]} />
        </Field>
      )}
      <div className="flex gap-2">
        <Button
          onClick={() =>
            onSubmit({ kind: "correction", a: Number(a) || 0, b: Number(b) || 0, servingTeam: serving, serverNumber: server === "2" ? 2 : 1 })
          }
        >
          Apply
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function RallyButton({
  match,
  team,
  score,
  serving,
  serverNumber,
  showServer,
  onPress,
  disabled,
  point,
}: {
  match: Match;
  team: Team;
  score: number;
  serving: boolean;
  serverNumber: 1 | 2;
  showServer: boolean;
  onPress: () => void;
  disabled: boolean;
  point: string | null;
}) {
  const ids = team === "A" ? match.team_a : match.team_b;
  const { players } = useData();
  return (
    <button
      type="button"
      aria-label={`Rally won by ${teamLabel(players, ids)} (${score} points${serving ? ", serving" : ""})`}
      onClick={onPress}
      disabled={disabled}
      className={cx(
        "relative flex min-h-36 w-full flex-1 items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-transform select-none active:scale-[0.98] disabled:opacity-60 sm:min-h-44",
        serving ? "border-ball bg-ball/15" : "border-line bg-surface",
      )}
    >
      <span className={cx("w-2 self-stretch rounded-full", team === "A" ? "bg-team-a" : "bg-team-b")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-xl leading-tight font-bold break-words sm:text-2xl">
          <TeamNames ids={ids} link={false} />
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          {serving ? (
            <span className="flex items-center gap-1 font-semibold text-text">
              <BallIcon className="size-4" /> Serving{showServer ? ` · server ${serverNumber}` : ""}
            </span>
          ) : (
            <span>Receiving</span>
          )}
          {point && <Badge tone="ball">{point}</Badge>}
        </span>
        <span className="mt-2 block text-xs font-medium text-muted">Tap if they won the rally</span>
      </span>
      <span key={score} className="score-pop tabular text-7xl font-black sm:text-8xl">
        {score}
      </span>
    </button>
  );
}

function Pad({ match }: { match: Match }) {
  const router = useRouter();
  const { matches, ratings } = useData();
  const format = useMemo(() => formatOf(match), [match]);
  const [events, setEvents] = useState<RallyEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const pending = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  // Number of rallies this device believes are stored, and a flag to force a refetch after a failed write.
  const localCount = useRef<number | null>(null);
  const forceReload = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);
  useWakeLock();

  const reload = () => {
    forceReload.current = true;
    setReloadKey((k) => k + 1);
  };

  // Load rallies on open, and again whenever the stored count differs from ours
  // (another device scored) once our own writes have settled.
  useEffect(() => {
    if (!forceReload.current && (pending.current > 0 || localCount.current === match.rally_count)) return;
    forceReload.current = false;
    let cancelled = false;
    fetchRallies(match.id)
      .then((list) => {
        if (cancelled) return;
        localCount.current = list.length;
        setEvents(list);
      })
      .catch((err) => !cancelled && setError(friendlyError(err)));
    return () => {
      cancelled = true;
    };
  }, [match.id, match.rally_count, reloadKey]);

  const state = useMemo(() => (events ? replay(format, events, match.first_server) : null), [events, format, match.first_server]);

  const enqueue = (write: () => Promise<void>) => {
    pending.current++;
    chain.current = chain.current
      .then(write)
      .catch((err) => {
        setError(friendlyError(err));
        reload();
      })
      .finally(() => {
        pending.current--;
      });
  };

  const push = (event: RallyEvent) => {
    if (!events) return;
    const next = [...events, event];
    const nextState = replay(format, next, match.first_server);
    localCount.current = next.length;
    setEvents(next);
    setError(null);
    if (navigator.vibrate) navigator.vibrate(15);
    enqueue(() => recordRally(match.id, next.length, event, nextState));
  };

  const undo = () => {
    if (!events || events.length === 0) return;
    const next = events.slice(0, -1);
    const seq = events.length;
    localCount.current = next.length;
    setEvents(next);
    setError(null);
    enqueue(() => undoRally(match.id, seq, replay(format, next, match.first_server)));
  };

  if (!events || !state) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  const wins = gameWins(state.games);
  const doublesSideout = format.mode === "doubles" && format.scoring === "sideout";
  // Game/match point: the team that would win the game on its next point (only the server can score in side-out).
  const pointLabel = (team: Team): string | null => {
    if (state.winner) return null;
    if (format.scoring === "sideout" && state.servingTeam !== team) return null;
    const after = team === "A" ? { a: state.current.a + 1, b: state.current.b } : { a: state.current.a, b: state.current.b + 1 };
    if (!isGameWon(after, format)) return null;
    return wins[team] + 1 >= Math.floor(format.bestOf / 2) + 1 ? "Match point" : "Game point";
  };

  if (state.winner) {
    const queue = upcomingMatches(matches, (m) => m.id !== match.id);
    const nextUp = queue.find((m) => (match.session_id ? m.session_id === match.session_id : true));
    const done = match.status === "completed";
    const info = ratings.byMatch.get(match.id);
    return (
      <div className="space-y-4">
        <Card className="space-y-4 p-5 text-center">
          <p className="text-sm font-semibold text-muted">{done ? "Result saved" : "Game, set, match"}</p>
          <p className="text-2xl font-bold">
            <TeamNames ids={state.winner === "A" ? match.team_a : match.team_b} link={false} /> win
          </p>
          <p className="tabular text-xl font-semibold">{fmt.gamesScore(state.games)}</p>
          {info && (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
              {info.changes.map((c) => (
                <span key={c.playerId}>
                  <TeamNames ids={[c.playerId]} link={false} /> <Delta value={c.delta} />
                </span>
              ))}
            </div>
          )}
          {!done ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                disabled={finishing}
                onClick={async () => {
                  setFinishing(true);
                  setError(null);
                  try {
                    await chain.current;
                    await completeMatch(match.id, state.games);
                  } catch (err) {
                    setError(friendlyError(err));
                  } finally {
                    setFinishing(false);
                  }
                }}
              >
                {finishing ? "Saving…" : "Confirm result"}
              </Button>
              <Button variant="secondary" size="lg" onClick={undo} disabled={finishing}>
                <UndoIcon className="size-5" /> Undo last rally
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              {nextUp && (
                <ButtonLink href={`/ref/score/${nextUp.id}`} size="lg">
                  Next match
                </ButtonLink>
              )}
              {match.session_id && (
                <ButtonLink href="/ref/session" variant="secondary" size="lg">
                  Back to session
                </ButtonLink>
              )}
              <ButtonLink href={`/matches/${match.id}`} variant="ghost" size="lg">
                Match details
              </ButtonLink>
            </div>
          )}
          <ErrorNote>{error}</ErrorNote>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted">
          {format.bestOf > 1 && (
            <span className="mr-2 font-semibold text-text">
              Game {state.games.length + 1} · {wins.A}–{wins.B}
            </span>
          )}
          {formatLabel(match)}
        </div>
        <Link href={`/matches/${match.id}`} className="text-sm font-semibold text-primary">
          View
        </Link>
      </div>

      <div className="rounded-2xl bg-surface-2 py-3 text-center">
        <div className="text-xs font-semibold tracking-wider text-muted uppercase">Score call</div>
        <div className="tabular text-5xl font-black tracking-tight">{scoreCall(state, format)}</div>
        {state.notice === "switch-ends" && (
          <div className="mx-auto mt-2 w-fit rounded-full bg-ball px-3 py-1 text-sm font-bold text-ball-fg">Switch ends</div>
        )}
        {state.notice === "game-over" && (
          <div className="mx-auto mt-2 w-fit rounded-full bg-ball px-3 py-1 text-sm font-bold text-ball-fg">
            Game {state.games.length} to {state.games[state.games.length - 1].a > state.games[state.games.length - 1].b ? "Team A" : "Team B"}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {(["A", "B"] as const).map((team) => (
          <RallyButton
            key={team}
            match={match}
            team={team}
            score={team === "A" ? state.current.a : state.current.b}
            serving={state.servingTeam === team}
            serverNumber={state.serverNumber}
            showServer={doublesSideout}
            onPress={() => push({ kind: "rally", winner: team })}
            disabled={correcting}
            point={pointLabel(team)}
          />
        ))}
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" onClick={undo} disabled={events.length === 0}>
          <UndoIcon className="size-5" /> Undo
        </Button>
        <Button variant="secondary" size="lg" onClick={() => setCorrecting((c) => !c)}>
          Fix score
        </Button>
      </div>

      {correcting && (
        <CorrectionForm
          current={{ ...state.current, servingTeam: state.servingTeam, serverNumber: state.serverNumber }}
          doublesSideout={doublesSideout}
          onCancel={() => setCorrecting(false)}
          onSubmit={(e) => {
            setCorrecting(false);
            push(e);
          }}
        />
      )}

      <p className="text-center text-xs text-muted">
        {format.scoring === "sideout"
          ? `Side-out: only the serving team scores. ${state.servingTeam === "A" ? "Team A" : "Team B"} serving; if they lose the rally ${
              doublesSideout && state.serverNumber === 1 ? "their second server serves" : `serve passes to ${other(state.servingTeam) === "A" ? "Team A" : "Team B"}`
            }.`
          : "Rally scoring: every rally wins a point and the winner serves next."}
      </p>

      <div className="border-t border-line pt-4 text-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (!confirm("Abandon this match? The score is cleared and the match goes back to the queue.")) return;
            try {
              await chain.current;
              await resetMatch(match.id);
              router.push("/ref");
            } catch (err) {
              setError(friendlyError(err));
            }
          }}
        >
          Abandon match
        </Button>
      </div>
    </div>
  );
}

export function ScoringPad() {
  const { id } = useParams<{ id: string }>();
  const { matches } = useData();
  const match = matches.get(id);

  if (!match) return <Empty title="Match not found" action={<ButtonLink href="/ref">Referee home</ButtonLink>} />;
  if (match.team_a.length === 0 || match.team_b.length === 0) {
    return <Empty title="Waiting for players">This bracket match fills in when the earlier rounds finish.</Empty>;
  }
  if (match.status === "void") return <Empty title="This match was voided" />;
  if (match.status === "scheduled") return <StartPanel match={match} />;
  if (match.status === "completed" && match.rally_count === 0) {
    return (
      <Empty title="Result already recorded" action={<ButtonLink href={`/matches/${match.id}`}>View match</ButtonLink>}>
        This match was entered as a final score.
      </Empty>
    );
  }
  return <Pad match={match} />;
}
