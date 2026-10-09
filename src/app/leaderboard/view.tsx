"use client";

import Link from "next/link";
import { useState } from "react";
import { LeaderboardTable } from "@/components/leaderboard";
import { WhenReady } from "@/components/loading";
import { RatingRace } from "@/components/rating-chart";
import { Records } from "@/components/records";
import { PageTitle, SectionTitle, Segmented, Toggle } from "@/components/ui";
import type { Mode } from "@/lib/elo";

export function LeaderboardView() {
  const [mode, setMode] = useState<Mode>("doubles");
  const [inactive, setInactive] = useState(false);
  return (
    <WhenReady>
      <PageTitle
        subtitle={
          <>
            Elo ratings update after every match.{" "}
            <Link href="/about" className="font-semibold text-primary hover:underline">
              How ratings work
            </Link>
          </>
        }
      >
        Ratings
      </PageTitle>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Rating type"
          value={mode}
          onChange={setMode}
          options={[
            { value: "doubles", label: "Doubles" },
            { value: "singles", label: "Singles" },
          ]}
        />
        <div className="w-48">
          <Toggle checked={inactive} onChange={setInactive} label="Show inactive" />
        </div>
      </div>
      <LeaderboardTable mode={mode} showInactive={inactive} />
      <section className="mt-8">
        <SectionTitle>Rating race</SectionTitle>
        <RatingRace mode={mode} />
      </section>
      <section className="mt-8">
        <SectionTitle>Records</SectionTitle>
        <Records mode={mode} />
      </section>
    </WhenReady>
  );
}
