import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading";
import { TournamentView } from "./view";

export const metadata: Metadata = { title: "Tournament" };

export default function TournamentPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TournamentView />
    </Suspense>
  );
}
