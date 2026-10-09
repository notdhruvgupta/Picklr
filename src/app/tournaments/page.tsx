import type { Metadata } from "next";
import { TournamentsView } from "./view";

export const metadata: Metadata = { title: "Tournaments" };

export default function TournamentsPage() {
  return <TournamentsView />;
}
