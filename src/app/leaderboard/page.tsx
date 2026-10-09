import type { Metadata } from "next";
import { LeaderboardView } from "./view";

export const metadata: Metadata = { title: "Ratings" };

export default function LeaderboardPage() {
  return <LeaderboardView />;
}
