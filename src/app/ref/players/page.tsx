import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading";
import { RefereeGate } from "@/components/referee-gate";
import { ManagePlayers } from "./manage";

export const metadata: Metadata = { title: "Manage players" };

export default function ManagePlayersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RefereeGate>
        <ManagePlayers />
      </RefereeGate>
    </Suspense>
  );
}
