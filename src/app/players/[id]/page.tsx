import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading";
import { PlayerView } from "./view";

export const metadata: Metadata = { title: "Player" };

export default function PlayerPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlayerView />
    </Suspense>
  );
}
