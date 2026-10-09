import type { Metadata } from "next";
import { RefereeGate } from "@/components/referee-gate";
import { SessionManager } from "./manager";

export const metadata: Metadata = { title: "Session" };

export default function SessionPage() {
  return (
    <RefereeGate>
      <SessionManager />
    </RefereeGate>
  );
}
