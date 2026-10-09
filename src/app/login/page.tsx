import type { Metadata } from "next";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Referee login" };

export default function LoginPage() {
  return <LoginForm />;
}
