"use client";

import { useEffect, useState } from "react";
import type { ScoringSystem } from "@/lib/scoring";
import { Field, Segmented, Select } from "./ui";

export interface FormatChoice {
  scoring: ScoringSystem;
  pointsToWin: number;
  winBy: number;
  bestOf: number;
}

const DEFAULT: FormatChoice = { scoring: "sideout", pointsToWin: 11, winBy: 2, bestOf: 1 };
const KEY = "pb:last-format";

/** Last-used format, remembered on this device. */
export function useRememberedFormat(): [FormatChoice, (f: FormatChoice) => void] {
  const [format, setFormat] = useState<FormatChoice>(DEFAULT);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from storage after mount
      if (saved) setFormat({ ...DEFAULT, ...JSON.parse(saved) });
    } catch {
      // Storage unavailable: keep defaults.
    }
  }, []);
  const update = (f: FormatChoice) => {
    setFormat(f);
    try {
      localStorage.setItem(KEY, JSON.stringify(f));
    } catch {
      // Ignore.
    }
  };
  return [format, update];
}

export function FormatFields({ value, onChange }: { value: FormatChoice; onChange: (f: FormatChoice) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Scoring">
        <Segmented
          label="Scoring system"
          value={value.scoring}
          className="w-full"
          onChange={(scoring) => onChange({ ...value, scoring, pointsToWin: scoring === "rally" ? (value.pointsToWin === 11 ? 21 : value.pointsToWin) : 11 })}
          options={[
            { value: "sideout", label: "Side-out" },
            { value: "rally", label: "Rally" },
          ]}
        />
      </Field>
      <Field label="Game to">
        <Select value={value.pointsToWin} onChange={(e) => onChange({ ...value, pointsToWin: Number(e.target.value) })}>
          {[7, 9, 11, 15, 21].map((n) => (
            <option key={n} value={n}>
              {n} points
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Win by">
        <Segmented
          label="Win by"
          value={String(value.winBy) as "1" | "2"}
          className="w-full"
          onChange={(v) => onChange({ ...value, winBy: Number(v) })}
          options={[
            { value: "2", label: "Win by 2" },
            { value: "1", label: "Win by 1" },
          ]}
        />
      </Field>
      <Field label="Games">
        <Segmented
          label="Best of"
          value={String(value.bestOf) as "1" | "3"}
          className="w-full"
          onChange={(v) => onChange({ ...value, bestOf: Number(v) })}
          options={[
            { value: "1", label: "Single game" },
            { value: "3", label: "Best of 3" },
          ]}
        />
      </Field>
    </div>
  );
}
