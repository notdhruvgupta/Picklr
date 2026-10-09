import type { Metadata } from "next";
import { MatchesView } from "./view";

export const metadata: Metadata = { title: "Matches" };

export default function MatchesPage() {
  return <MatchesView />;
}
