import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading";
import { MatchDetailView } from "./view";

export const metadata: Metadata = { title: "Match" };

export default function MatchPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MatchDetailView />
    </Suspense>
  );
}
