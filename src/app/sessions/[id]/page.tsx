import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading";
import { SessionView } from "./view";

export const metadata: Metadata = { title: "Session" };

export default function SessionPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SessionView />
    </Suspense>
  );
}
