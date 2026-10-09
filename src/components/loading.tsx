"use client";

import type { ReactNode } from "react";
import { useData } from "@/lib/data/store";
import { Skeleton } from "./ui";

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28" />
      <Skeleton className="h-64" />
    </div>
  );
}

/** Render children once the initial data snapshot has arrived. */
export function WhenReady({ children }: { children: ReactNode }) {
  const { status } = useData();
  if (status !== "ready") return <PageSkeleton />;
  return <>{children}</>;
}
