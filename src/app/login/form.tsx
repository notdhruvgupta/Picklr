"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { BallIcon } from "@/components/bits";
import { Button, ButtonLink, Card, ErrorNote, Field, Input } from "@/components/ui";
import { useAuth } from "@/lib/data/auth";

export function LoginForm() {
  const { signIn, signOut, session, isReferee, checking } = useAuth();
  const router = useRouter();

  const [error, submit, pending] = useActionState(async (_prev: string | null, form: FormData) => {
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) return "Enter the referee email and password.";
    const message = await signIn(email, password);
    return message ? (/invalid/i.test(message) ? "Wrong email or password." : message) : null;
  }, null);

  useEffect(() => {
    if (session && isReferee) router.replace("/ref");
  }, [session, isReferee, router]);

  if (!checking && session && !isReferee) {
    return (
      <Card className="mx-auto max-w-sm space-y-4 p-6 text-center">
        <p className="font-semibold">Signed in, but not as a referee</p>
        <p className="text-sm text-muted">Ask the group admin to grant this account referee access.</p>
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-sm pt-6">
      <Card className="p-6">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <BallIcon className="size-12" />
          <h1 className="text-xl font-bold">Referee login</h1>
          <p className="text-sm text-muted">Watching doesn&apos;t need an account. This is only for scoring and managing matches.</p>
        </div>
        <form action={submit} className="space-y-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
      <div className="mt-4 text-center">
        <ButtonLink href="/" variant="ghost" size="sm">
          Back to scores
        </ButtonLink>
      </div>
    </div>
  );
}
