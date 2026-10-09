"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/bits";
import { useConfirm } from "@/components/confirm";
import { Badge, Button, Card, ErrorNote, Field, Input, PageTitle, SectionTitle, Toggle } from "@/components/ui";
import { deletePlayer, friendlyError, savePlayer } from "@/lib/data/actions";
import { useData } from "@/lib/data/store";
import * as fmt from "@/lib/format";
import type { Player } from "@/lib/types";

interface Draft {
  id?: string;
  name: string;
  nickname: string;
  doubles: string;
  singles: string;
  active: boolean;
}

const toDraft = (p: Player): Draft => ({
  id: p.id,
  name: p.name,
  nickname: p.nickname ?? "",
  doubles: String(Math.round(p.initial_doubles)),
  singles: String(Math.round(p.initial_singles)),
  active: p.is_active,
});

function PlayerForm({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const { config } = useData();
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = !d.id;

  const submit = async () => {
    const doubles = Number(d.doubles);
    const singles = Number(d.singles);
    if (!d.name.trim()) return setError("Enter a name.");
    if (![doubles, singles].every((n) => Number.isFinite(n) && n >= 100 && n <= 4000)) {
      return setError("Starting ratings must be between 100 and 4000.");
    }
    setBusy(true);
    setError(null);
    try {
      await savePlayer({ id: d.id, name: d.name, nickname: d.nickname, initial_doubles: doubles, initial_singles: singles, is_active: d.active });
      onDone();
    } catch (err) {
      const message = friendlyError(err);
      setError(/duplicate key|unique/i.test(message) ? "There's already a player with that name." : message);
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4 border-primary/50 p-4">
      <p className="font-semibold">{isNew ? "Add a player" : `Edit ${draft.name}`}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="p-name">
          <Input id="p-name" value={d.name} maxLength={40} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Nickname (optional)" htmlFor="p-nick">
          <Input id="p-nick" value={d.nickname} maxLength={40} onChange={(e) => setD({ ...d, nickname: e.target.value })} />
        </Field>
        <Field label="Starting doubles rating" htmlFor="p-dbl" hint={`Average player ≈ ${config.baseRating}. Stronger players higher.`}>
          <Input id="p-dbl" inputMode="numeric" value={d.doubles} onChange={(e) => setD({ ...d, doubles: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label="Starting singles rating" htmlFor="p-sgl">
          <Input id="p-sgl" inputMode="numeric" value={d.singles} onChange={(e) => setD({ ...d, singles: e.target.value.replace(/\D/g, "") })} />
        </Field>
      </div>
      <Toggle checked={d.active} onChange={(active) => setD({ ...d, active })} label="Active" description="Inactive players are hidden from the leaderboard and match setup." />
      {!isNew && <p className="text-xs text-muted">Changing a starting rating replays every match, so current ratings update everywhere.</p>}
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={busy}>
          {isNew ? "Add player" : "Save"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export function ManagePlayers() {
  const { players, ratings, config } = useData();
  const confirm = useConfirm();
  const params = useSearchParams();
  const router = useRouter();
  const editId = params.get("edit");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = editId ? players.get(editId) : undefined;
  const list = [...players.values()].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name));
  const close = () => {
    setAdding(false);
    if (editId) router.replace("/ref/players");
  };

  return (
    <div className="space-y-6">
      <PageTitle
        subtitle="Starting ratings are where each player's Elo begins; matches move it from there."
        action={
          !adding &&
          !editing && (
            <Button onClick={() => setAdding(true)} size="sm">
              Add player
            </Button>
          )
        }
      >
        Players
      </PageTitle>

      {adding && (
        <PlayerForm
          draft={{ name: "", nickname: "", doubles: String(config.baseRating), singles: String(config.baseRating), active: true }}
          onDone={close}
        />
      )}
      {editing && <PlayerForm key={editing.id} draft={toDraft(editing)} onDone={close} />}
      <ErrorNote>{error}</ErrorNote>

      <section>
        <SectionTitle>{list.length} players</SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          {list.map((p) => {
            const r = ratings.players.get(p.id);
            const played = (r?.doubles.matches ?? 0) + (r?.singles.matches ?? 0);
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={p.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{p.name}</span>
                    {!p.is_active && <Badge>Inactive</Badge>}
                  </div>
                  <div className="tabular text-xs text-muted">
                    Start {fmt.rating(p.initial_doubles)} D / {fmt.rating(p.initial_singles)} S · now {fmt.rating(r?.doubles.rating ?? p.initial_doubles)} D · {played} matches
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => router.replace(`/ref/players?edit=${p.id}`)}>
                  Edit
                </Button>
                {played === 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Delete ${p.name}?`,
                        body: "They have no matches, so nothing else changes. This can't be undone.",
                        confirmLabel: "Delete player",
                        danger: true,
                      });
                      if (!ok) return;
                      try {
                        setError(null);
                        await deletePlayer(p.id);
                      } catch (err) {
                        setError(friendlyError(err));
                      }
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
      </section>
    </div>
  );
}
