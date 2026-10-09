/**
 * Create (or update the password of) the referee account.
 *
 * Reads from .env.local (or the environment):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, REFEREE_EMAIL, REFEREE_PASSWORD
 *
 * Usage: npm run referee:create
 */

import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Set it in .env.local or the environment.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const secret = required("SUPABASE_SECRET_KEY");
  const email = required("REFEREE_EMAIL").toLowerCase();
  const password = required("REFEREE_PASSWORD");
  if (password.length < 8) {
    console.error("REFEREE_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  let user = list.users.find((u) => u.email?.toLowerCase() === email);

  if (user) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
    console.log(`Updated password for ${email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
    console.log(`Created ${email}`);
  }

  const { error: refError } = await admin
    .from("referees")
    .upsert({ user_id: user.id, display_name: "Referee" }, { onConflict: "user_id" });
  if (refError) throw refError;
  console.log("Referee access granted.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
