"use client";

import { useAuth } from "./auth";
import { useData } from "./store";

/**
 * Who may change what. Matches, sessions and tournaments belong to the referee
 * who started them; the database enforces this, and the UI mirrors it so other
 * referees see read-only views instead of buttons that would fail.
 */
export function useOwnership() {
  const { isReferee, userId } = useAuth();
  const { referees } = useData();
  return {
    me: userId,
    myName: userId ? (referees.get(userId)?.display_name ?? null) : null,
    /** More than one referee: worth telling people who runs what. */
    multiple: referees.size > 1,
    /** Rows without an owner (from before referees had names) are editable by any referee. */
    canEdit: (owner: string | null | undefined) => isReferee && (owner == null || owner === userId),
    ownerName: (owner: string | null | undefined) => (owner ? (referees.get(owner)?.display_name ?? "another referee") : null),
    others: [...referees.values()].filter((r) => r.user_id !== userId).sort((a, b) => a.display_name.localeCompare(b.display_name)),
  };
}
