import type { Metadata } from "next";
import { RefereeGate } from "@/components/referee-gate";
import { Settings } from "./settings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <RefereeGate>
      <Settings />
    </RefereeGate>
  );
}
