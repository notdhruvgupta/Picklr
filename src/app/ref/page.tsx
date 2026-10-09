import type { Metadata } from "next";
import { RefereeGate } from "@/components/referee-gate";
import { Dashboard } from "./dashboard";

export const metadata: Metadata = { title: "Referee" };

export default function RefereePage() {
  return (
    <RefereeGate>
      <Dashboard />
    </RefereeGate>
  );
}
