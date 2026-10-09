"use client";

import { useState } from "react";
import { friendlyError, handOver, type OwnedKind } from "@/lib/data/actions";
import { useAuth } from "@/lib/data/auth";
import { useOwnership } from "@/lib/data/ownership";
import { useConfirm } from "./confirm";
import { Button, Card, ErrorNote, Select } from "./ui";

const NOUN: Record<OwnedKind, string> = { match: "match", session: "session", tournament: "tournament" };

/** "Run by Gaurav", shown once the group has more than one referee. */
export function RunBy({ owner, className }: { owner: string | null | undefined; className?: string }) {
  const { multiple, ownerName, me } = useOwnership();
  if (!multiple || !owner) return null;
  return <span className={className}>Run by {owner === me ? "you" : ownerName(owner)}</span>;
}

/** Shown to a referee looking at something another referee runs. */
export function NotYours({ owner, kind }: { owner: string | null | undefined; kind: OwnedKind }) {
  const { isReferee } = useAuth();
  const { canEdit, ownerName } = useOwnership();
  if (!isReferee || canEdit(owner)) return null;
  return (
    <Card className="p-4 text-sm">
      <span className="font-semibold">{ownerName(owner)}</span> is running this {NOUN[kind]}, so only they can change it. They can hand it
      over to you if needed.
    </Card>
  );
}

/** Lets the owner pass a match, session or tournament to another referee. */
export function HandOver({ kind, id, owner, note }: { kind: OwnedKind; id: string; owner: string | null; note?: string }) {
  const { canEdit, others } = useOwnership();
  const confirm = useConfirm();
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!canEdit(owner) || others.length === 0) return null;

  const target = others.find((r) => r.user_id === to);
  const submit = async () => {
    if (!target) return;
    const ok = await confirm({
      title: `Hand this ${NOUN[kind]} to ${target.display_name}?`,
      body: `${target.display_name} will be able to change it and you won't, unless they hand it back.${note ? ` ${note}` : ""}`,
      confirmLabel: "Hand over",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await handOver(kind, id, target.user_id);
      setTo("");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label={`Hand this ${NOUN[kind]} over to`} value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-auto py-0 text-sm">
          <option value="">Hand over to…</option>
          {others.map((r) => (
            <option key={r.user_id} value={r.user_id}>
              {r.display_name}
            </option>
          ))}
        </Select>
        <Button variant="secondary" size="sm" disabled={!target || busy} onClick={submit}>
          Hand over
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
