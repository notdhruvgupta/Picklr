"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TeamNames } from "@/components/bits";
import { useConfirm } from "@/components/confirm";
import { FormatFields, useRememberedFormat } from "@/components/format-fields";
import { MatchRow, UpcomingRow, WinChanceBar } from "@/components/match";
import { SessionStandings, ShareRecap, sessionMatches } from "@/components/session";
import { Button, ButtonLink, Card, ErrorNote, LiveBadge, PageTitle, SectionTitle, Segmented, cx } from "@/components/ui";
import { createMatch, friendlyError, openSession, updateSession } from "@/lib/data/actions";
import { playersByRating } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import type { Mode } from "@/lib/elo";
import { suggestNextMatch } from "@/lib/matchmaking";
import { seededRandom } from "@/lib/random";
import type { PlaySession } from "@/lib/types";

function CheckIn({ selected, onChange, mode }: { selected: string[]; onChange: (ids: string[]) => void; mode: Mode }) {
  const { players, ratings } = useData();
  const list = playersByRating(players, ratings, mode);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {list.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(p.id)}
            className={cx(
              "flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold transition-colors",
              on ? "border-primary bg-primary/10" : "border-line bg-surface text-muted hover:text-text",
            )}
          >
            {p.name}
            <span className={cx("size-4 rounded-full border-2", on ? "border-primary bg-primary" : "border-line")} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

function StartSession() {
  const { players } = useData();
  const [mode, setMode] = useState<Mode>("doubles");
  const [present, setPresent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const need = mode === "doubles" ? 4 : 2;

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Check in who's here. The app then suggests each next match so everyone plays a fair share, with fresh partners and close games.">
        Start a session
      </PageTitle>
      <Segmented
        label="Session type"
        value={mode}
        onChange={setMode}
        options={[
          { value: "doubles", label: "Doubles" },
          { value: "singles", label: "Singles" },
        ]}
      />
      <section>
        <SectionTitle
          action={
            <Button variant="ghost" size="sm" onClick={() => setPresent(present.length ? [] : [...players.values()].filter((p) => p.is_active).map((p) => p.id))}>
              {present.length ? "Clear" : "Everyone"}
            </Button>
          }
        >
          Who&apos;s here? · {present.length}
        </SectionTitle>
        <CheckIn selected={present} onChange={setPresent} mode={mode} />
      </section>
      <ErrorNote>{error}</ErrorNote>
      <Button
        size="lg"
        className="w-full"
        disabled={present.length < need || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await openSession(mode, present);
          } catch (err) {
            setError(friendlyError(err));
            setBusy(false);
          }
        }}
      >
        {present.length < need ? `Check in at least ${need} players` : `Start session with ${present.length}`}
      </Button>
    </div>
  );
}

function OpenSession({ session }: { session: PlaySession }) {
  const router = useRouter();
  const { players, matches, ratings, config } = useData();
  const confirm = useConfirm();
  const [seed, setSeed] = useState(1);
  const [editing, setEditing] = useState(false);
  const [format, setFormat] = useRememberedFormat();
  const [showFormat, setShowFormat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = sessionMatches(matches, session.id);
  const live = list.filter((m) => m.status === "live");
  const queued = list.filter((m) => m.status === "scheduled");
  const done = list.filter((m) => m.status === "completed").reverse();
  const present = session.present_player_ids.filter((id) => players.has(id));
  const rated = present.map((id) => ({ id, rating: ratings.players.get(id)?.[session.mode].rating ?? config.baseRating }));
  const onCourt = live.flatMap((m) => [...m.team_a, ...m.team_b]);
  const suggestion = suggestNextMatch(
    rated,
    list.map((m) => ({ teamA: m.team_a, teamB: m.team_b })),
    session.mode,
    { unavailable: onCourt, random: seededRandom(seed + list.length * 7919) },
  );

  const create = async (start: boolean) => {
    if (!suggestion) return;
    setBusy(true);
    setError(null);
    try {
      const m = await createMatch({
        mode: session.mode,
        format: { mode: session.mode, ...format },
        teamA: suggestion.teamA,
        teamB: suggestion.teamB,
        isRated: true,
        sessionId: session.id,
        queuePosition: start ? null : Math.max(0, ...queued.map((q) => q.queue_position ?? 0)) + 1,
      });
      if (start) router.push(`/ref/score/${m.id}`);
      else setSeed((s) => s + 1);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageTitle
        subtitle={`${session.mode === "doubles" ? "Doubles" : "Singles"} · ${present.length} checked in · ${done.length} played`}
        action={
          <div className="flex gap-2">
            <ShareRecap session={session} />
            <ButtonLink href={`/sessions/${session.id}`} variant="ghost" size="sm">
              Public view
            </ButtonLink>
          </div>
        }
      >
        Today&apos;s session
      </PageTitle>

      {live.map((m) => (
        <Card key={m.id} className="flex items-center gap-3 p-4">
          <LiveBadge />
          <div className="min-w-0 flex-1 truncate text-sm">
            <TeamNames ids={m.team_a} link={false} /> <span className="text-muted">vs</span> <TeamNames ids={m.team_b} link={false} />
          </div>
          <ButtonLink href={`/ref/score/${m.id}`} size="sm">
            Score
          </ButtonLink>
        </Card>
      ))}

      <section>
        <SectionTitle>Suggested next match</SectionTitle>
        {suggestion ? (
          <Card className="space-y-4 p-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
              <div className="font-semibold">
                <TeamNames ids={suggestion.teamA} />
              </div>
              <span className="text-sm text-muted">vs</span>
              <div className="font-semibold">
                <TeamNames ids={suggestion.teamB} />
              </div>
            </div>
            <WinChanceBar chance={suggestion.expectedA} />
            <p className="text-xs text-muted">
              {suggestion.sittingOut.length > 0 && (
                <>
                  Sitting out: <TeamNames list ids={suggestion.sittingOut} link={false} />.{" "}
                </>
              )}
              {suggestion.notes.map((n) => n[0].toUpperCase() + n.slice(1)).join(" · ")}
            </p>
            {showFormat && <FormatFields value={format} onChange={setFormat} />}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => create(true)} disabled={busy}>
                Start now
              </Button>
              <Button variant="secondary" onClick={() => create(false)} disabled={busy}>
                Queue it
              </Button>
              <Button variant="ghost" onClick={() => setSeed((s) => s + 1)}>
                Shuffle
              </Button>
              <Button variant="ghost" onClick={() => setShowFormat((s) => !s)}>
                {format.scoring === "rally" ? "Rally" : "Side-out"} to {format.pointsToWin}
              </Button>
              <ButtonLink href="/ref/match/new" variant="ghost">
                Pick manually
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <p className="text-sm text-muted">Not enough players free right now.</p>
        )}
        <ErrorNote>{error}</ErrorNote>
      </section>

      {queued.length > 0 && (
        <section>
          <SectionTitle>Queue</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {queued.map((m, i) => (
              <UpcomingRow key={m.id} match={m} index={i} />
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Standings today</SectionTitle>
        <SessionStandings session={session} />
      </section>

      {done.length > 0 && (
        <section>
          <SectionTitle>Played</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {done.map((m) => (
              <MatchRow key={m.id} match={m} showDate={false} />
            ))}
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle
          action={
            <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)}>
              {editing ? "Done" : "Edit"}
            </Button>
          }
        >
          Checked in · {present.length}
        </SectionTitle>
        {editing ? (
          <CheckIn
            selected={present}
            mode={session.mode}
            onChange={(ids) => void updateSession(session.id, { present_player_ids: ids }).catch((err) => setError(friendlyError(err)))}
          />
        ) : (
          <p className="text-sm">
            <TeamNames list ids={present} />
          </p>
        )}
      </section>

      <div className="border-t border-line pt-6">
        <Button
          variant="danger"
          onClick={async () => {
            const ok = await confirm({
              title: "End today's session?",
              body: live.length
                ? "A match is still being played. It stays live and can still be finished; it just won't be suggested from a session any more."
                : "All results are kept. You can start a new session any time.",
              confirmLabel: "End session",
            });
            if (!ok) return;
            try {
              await updateSession(session.id, { status: "closed", closed_at: new Date().toISOString() });
              router.push(`/sessions/${session.id}`);
            } catch (err) {
              setError(friendlyError(err));
            }
          }}
        >
          End session
        </Button>
        <p className="mt-2 text-xs text-muted">
          Ending keeps all results. <Link href="/sessions" className="underline">Past sessions</Link>
        </p>
      </div>
    </div>
  );
}

export function SessionManager() {
  const { sessions } = useData();
  const open = [...sessions.values()].filter((s) => s.status === "open").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return open ? <OpenSession session={open} /> : <StartSession />;
}
