"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/data/auth";
import { PageSkeleton, WhenReady } from "./loading";
import { ButtonLink, Empty } from "./ui";

/** Show children only to a signed-in referee. RLS enforces this server-side regardless. */
export function RefereeGate({ children }: { children: ReactNode }) {
  const { checking, session, isReferee } = useAuth();
  if (checking) return <PageSkeleton />;
  if (!session || !isReferee) {
    return (
      <Empty title="Referees only" action={<ButtonLink href="/login">Referee login</ButtonLink>}>
        {session ? "This account isn't set up as a referee." : "Sign in as the referee to create and score matches."}
      </Empty>
    );
  }
  return <WhenReady>{children}</WhenReady>;
}
