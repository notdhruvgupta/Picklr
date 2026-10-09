import type { Metadata } from "next";
import { RefereeGate } from "@/components/referee-gate";
import { NewMatchForm } from "./form";

export const metadata: Metadata = { title: "New match" };

export default function NewMatchPage() {
  return (
    <RefereeGate>
      <NewMatchForm />
    </RefereeGate>
  );
}
