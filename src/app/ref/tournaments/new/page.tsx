import type { Metadata } from "next";
import { RefereeGate } from "@/components/referee-gate";
import { NewTournament } from "./form";

export const metadata: Metadata = { title: "New tournament" };

export default function NewTournamentPage() {
  return (
    <RefereeGate>
      <NewTournament />
    </RefereeGate>
  );
}
