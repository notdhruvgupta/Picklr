import type { Metadata } from "next";
import { AboutView } from "./view";

export const metadata: Metadata = { title: "How ratings work" };

export default function AboutPage() {
  return <AboutView />;
}
