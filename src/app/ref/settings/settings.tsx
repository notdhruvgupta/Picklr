"use client";

import { useEffect, useState } from "react";
import { Button, Card, ErrorNote, Field, Input, PageTitle, SectionTitle, Toggle } from "@/components/ui";
import { friendlyError, saveSettings } from "@/lib/data/actions";
import { completedMatches, matchTime, teamLabel } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import { DEFAULT_ELO_CONFIG, kFactor, movMultiplier, type EloConfig } from "@/lib/elo";
import * as fmt from "@/lib/format";
import { supabase } from "@/lib/supabase";

const NUMBER_FIELDS: { key: keyof EloConfig; label: string; hint: string; min: number; max: number }[] = [
  { key: "baseRating", label: "Default starting rating", hint: "Used for players added without a starting rating.", min: 100, max: 4000 },
  { key: "kProvisional", label: "K for new players", hint: "How fast ratings move in a player's first matches.", min: 1, max: 100 },
  { key: "provisionalMatches", label: "New-player matches", hint: "Matches (per singles/doubles) before the lower K applies.", min: 0, max: 100 },
  { key: "kEstablished", label: "K after that", hint: "Bigger = more volatile ratings.", min: 1, max: 100 },
  { key: "movReferenceMargin", label: "Typical winning margin", hint: "A win by this many points (game to 11) counts at ×1.", min: 1, max: 10 },
  { key: "minMatchesRanked", label: "Matches before getting a rank", hint: "0 ranks everyone from their starting rating.", min: 0, max: 50 },
];

interface AuditRow {
  id: number;
  at: string;
  action: string;
  entity: string;
  details: { old?: Record<string, unknown> | null; new?: Record<string, unknown> | null } | null;
}

function describe(row: AuditRow, playerName: (id: string) => string): string {
  const after = row.details?.new ?? {};
  const before = row.details?.old ?? {};
  if (row.entity === "players") {
    const name = (after.name ?? before.name) as string;
    if (row.action === "insert") return `Added player ${name}`;
    if (row.action === "delete") return `Deleted player ${name}`;
    const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
    return `Edited ${name}: ${changed.join(", ")}`;
  }
  if (row.entity === "matches") {
    const m = (row.action === "delete" ? before : after) as { team_a?: string[]; team_b?: string[]; status?: string; games?: { a: number; b: number }[] };
    const teams = `${(m.team_a ?? []).map(playerName).join(" & ")} vs ${(m.team_b ?? []).map(playerName).join(" & ")}`;
    if (row.action === "insert") return `Created match ${teams}`;
    if (row.action === "delete") return `Deleted match ${teams}`;
    if (before.status !== after.status) return `Match ${teams}: ${before.status} → ${after.status}${m.games?.length ? ` (${fmt.gamesScore(m.games)})` : ""}`;
    if (JSON.stringify(before.games) !== JSON.stringify(after.games)) {
      return `Corrected ${teams}: ${fmt.gamesScore((before.games as { a: number; b: number }[]) ?? [])} → ${fmt.gamesScore(m.games ?? [])}`;
    }
    return `Edited match ${teams}`;
  }
  if (row.entity === "app_settings") return "Changed settings";
  if (row.entity === "tournaments") return `${row.action === "insert" ? "Created" : "Updated"} tournament ${(after.name ?? before.name) as string}`;
  return `${row.action} ${row.entity}`;
}

function ChangeLog() {
  const { players } = useData();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from("audit_log")
      .select("id, at, action, entity, details")
      .order("id", { ascending: false })
      .limit(60)
      .then(({ data, error: e }) => (e ? setError(e.message) : setRows(data as AuditRow[])));
  }, []);
  const name = (id: string) => players.get(id)?.name ?? "?";
  return (
    <section>
      <SectionTitle>Change log</SectionTitle>
      <ErrorNote>{error}</ErrorNote>
      {rows && (
        <Card className="max-h-96 divide-y divide-line overflow-y-auto">
          {rows.length === 0 && <p className="p-4 text-sm text-muted">No changes yet.</p>}
          {rows.map((r) => (
            <div key={r.id} className="flex gap-3 px-4 py-2 text-sm">
              <span className="tabular w-28 shrink-0 text-xs text-muted">
                {fmt.day(r.at)} {fmt.time(r.at)}
              </span>
              <span className="min-w-0">{describe(r, name)}</span>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}

function exportCsv(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Settings() {
  const { settings, config, players, matches, ratings } = useData();
  const [name, setName] = useState(settings?.group_name ?? "");
  const [draft, setDraft] = useState<EloConfig>(config);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = name !== settings?.group_name || JSON.stringify(draft) !== JSON.stringify(config);
  const example = (k: number) => Math.round(k * movMultiplier([{ a: 11, b: 6 }], 11, draft) * 0.5);

  const save = async () => {
    for (const f of NUMBER_FIELDS) {
      const v = draft[f.key] as number;
      if (!Number.isFinite(v) || v < f.min || v > f.max) return setError(`${f.label} must be between ${f.min} and ${f.max}.`);
    }
    if (!name.trim()) return setError("Enter a group name.");
    setBusy(true);
    setError(null);
    try {
      await saveSettings({ group_name: name.trim(), elo: draft });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const header = ["date", "mode", "team_a", "team_b", "score", "winner", "rated", "team_a_change", "team_b_change"];
    const rows = completedMatches(matches)
      .reverse()
      .map((m) => {
        const info = ratings.byMatch.get(m.id);
        const avg = (team: "A" | "B") => {
          const cs = info?.changes.filter((c) => c.team === team) ?? [];
          return cs.length ? (cs.reduce((s, c) => s + c.delta, 0) / cs.length).toFixed(1) : "";
        };
        return [matchTime(m), m.mode, teamLabel(players, m.team_a), teamLabel(players, m.team_b), fmt.gamesScore(m.games), m.winner ?? "", String(m.is_rated), avg("A"), avg("B")];
      });
    exportCsv([header, ...rows], `picklr-matches-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="space-y-8">
      <PageTitle>Settings</PageTitle>

      <section className="space-y-4">
        <SectionTitle>Group</SectionTitle>
        <Field label="Group name" htmlFor="g-name">
          <Input id="g-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </Field>
      </section>

      <section className="space-y-4">
        <SectionTitle>Ratings</SectionTitle>
        <p className="text-sm text-muted">
          Changes apply to the whole history instantly: every match is replayed with the new settings. An even match won 11–6 currently moves each player about{" "}
          <span className="font-semibold text-text">±{example(kFactor(0, draft))}</span> for new players and{" "}
          <span className="font-semibold text-text">±{example(kFactor(draft.provisionalMatches, draft))}</span> after that.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {NUMBER_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint} htmlFor={`cfg-${f.key}`}>
              <Input
                id={`cfg-${f.key}`}
                inputMode="numeric"
                value={String(draft[f.key])}
                onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value.replace(/[^\d]/g, "")) })}
              />
            </Field>
          ))}
        </div>
        <Toggle
          checked={draft.marginOfVictory}
          onChange={(v) => setDraft({ ...draft, marginOfVictory: v })}
          label="Margin of victory"
          description="Bigger wins move ratings more (11–0 counts ×1.39, 11–9 counts ×0.61)."
        />
        <ErrorNote>{error}</ErrorNote>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={!dirty || busy}>
            {saved ? "Saved" : "Save settings"}
          </Button>
          <Button variant="ghost" onClick={() => setDraft(DEFAULT_ELO_CONFIG)}>
            Reset rating settings to defaults
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Backup</SectionTitle>
        <p className="text-sm text-muted">Download every completed match with its rating changes as a spreadsheet.</p>
        <Button variant="secondary" onClick={download}>
          Export matches (CSV)
        </Button>
      </section>

      <ChangeLog />
    </div>
  );
}
