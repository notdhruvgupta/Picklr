/**
 * Create a referee account, or update an existing one's password and name.
 * Run it once per referee; other referees' accounts are never touched.
 *
 * Reads from an env file (default .env.local) or the environment:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, REFEREE_EMAIL, REFEREE_PASSWORD,
 *   REFEREE_NAME (optional: the name shown in the app, e.g. "Dhruv")
 *
 * Usage:
 *   npm run referee:create                       # local Supabase, from .env.local
 *   npm run referee:create -- --env .env.hosted  # hosted project, from a separate file
 */

import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const flag = process.argv.indexOf("--env");
const envFile = flag >= 0 ? process.argv[flag + 1] : ".env.local";
if (flag >= 0 && (!envFile || !existsSync(envFile))) {
  console.error(`Env file not found: ${envFile ?? "(missing path after --env)"}`);
  process.exit(1);
}
if (existsSync(envFile)) process.loadEnvFile(envFile);

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Set it in ${envFile} or the environment.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const secret = required("SUPABASE_SECRET_KEY");
  const email = required("REFEREE_EMAIL").toLowerCase();
  const password = required("REFEREE_PASSWORD");
  const name = process.env.REFEREE_NAME?.trim();
  if (name !== undefined && (name.length < 1 || name.length > 40)) {
    console.error("REFEREE_NAME must be 1–40 characters.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("REFEREE_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  console.log(`Using ${envFile} → ${new URL(url).host}`);
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

  const { data: existing, error: readError } = await admin.from("referees").select("display_name").eq("user_id", user.id).maybeSingle();
  if (readError) throw readError;
  // Keep a name the referee chose in the app unless REFEREE_NAME says otherwise.
  const displayName = name || existing?.display_name || defaultName(email);
  const { error: refError } = await admin
    .from("referees")
    .upsert({ user_id: user.id, display_name: displayName }, { onConflict: "user_id" });
  if (refError) throw refError;

  const { count } = await admin.from("referees").select("user_id", { count: "exact", head: true });
  console.log(`${existing ? "Updated" : "Added"} referee "${displayName}". This project now has ${count} referee${count === 1 ? "" : "s"}.`);
}

function defaultName(email: string): string {
  const local = email.split("@")[0].replace(/[._-]+/g, " ").trim() || "Referee";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
