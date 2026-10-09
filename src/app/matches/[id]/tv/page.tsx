import type { Metadata } from "next";
import { Suspense } from "react";
import { TvView } from "./view";

export const metadata: Metadata = { title: "Scoreboard" };

export default function TvPage() {
  return (
    <Suspense fallback={null}>
      <TvView />
    </Suspense>
  );
}
