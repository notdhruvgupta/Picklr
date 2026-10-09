import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading";
import { RefereeGate } from "@/components/referee-gate";
import { ScoringPad } from "./pad";

export const metadata: Metadata = { title: "Scoring" };

export default function ScorePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RefereeGate>
        <ScoringPad />
      </RefereeGate>
    </Suspense>
  );
}
