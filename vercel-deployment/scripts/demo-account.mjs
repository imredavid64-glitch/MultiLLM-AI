#!/usr/bin/env node
// Admin-only CLI for provisioning and revoking agency demo/trial accounts.
// Not part of the deployed app -- run locally by you, never exposed as an
// API route. Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// in the environment (e.g. `vercel env pull .env.local` first), and Node's
// built-in --env-file to load them:
//
//   node --env-file=.env.local scripts/demo-account.mjs create --email agency@example.com --name "Acme Agency"
//   node --env-file=.env.local scripts/demo-account.mjs revoke --email agency@example.com
//
// Uses only the existing profiles / platform_api_keys / auth.users tables --
// no schema changes. Demo access is capped two ways: a credits budget
// (profiles.credits) and a real expiry date (profiles.plan_expires_at),
// enforced in src/app/api/query/route.ts. `revoke` deactivates both the
// account and its platform API key immediately, ahead of natural expiry.

import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run `vercel env pull .env.local` first, then re-run this with:\n" +
      "  node --env-file=.env.local scripts/demo-account.mjs ...",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const KEY_PREFIX_LENGTH = 16; // must match src/lib/apiKeyAuth.ts
const VALID_TIERS = ["free", "pro", "enterprise"];

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, "");
    opts[key] = rest[i + 1];
  }
  return { command, opts };
}

function randomPassword() {
  // 24 random bytes, base64url -- well above Supabase's minimum, no
  // ambiguous characters to transcribe since it's copy-pasted, not typed.
  return randomBytes(24).toString("base64url");
}

function generatePlatformKey(tier) {
  return `mllm_${tier}_${randomBytes(24).toString("hex")}`;
}

function hashApiKey(key) {
  return createHash("sha256").update(key).digest("hex");
}

async function findUserByEmail(email) {
  // No direct "get user by email" in supabase-js admin API -- page through
  // listUsers. Fine at this scale (admin-provisioned demo accounts, not a
  // high-cardinality lookup).
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function create(opts) {
  const email = opts.email;
  if (!email) {
    console.error("Usage: create --email <email> [--name <name>] [--days 14] [--credits 200] [--tier pro]");
    process.exit(1);
  }
  const name = opts.name || email.split("@")[0];
  const days = Number(opts.days ?? 14);
  const credits = Number(opts.credits ?? 200);
  const tier = VALID_TIERS.includes(opts.tier) ? opts.tier : "pro";

  const existing = await findUserByEmail(email);
  if (existing) {
    console.error(`A user with email ${email} already exists (id ${existing.id}). Use a different email, or revoke and re-create.`);
    process.exit(1);
  }

  const password = randomPassword();
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip the confirmation-email flow for an admin-provisioned account
    user_metadata: { name },
  });
  if (createErr || !created.user) {
    console.error("Failed to create auth user:", createErr?.message);
    process.exit(1);
  }
  const userId = created.user.id;

  const planExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ plan: tier, credits, plan_expires_at: planExpiresAt, is_active: true, name })
    .eq("id", userId);
  if (profileErr) {
    console.error("Failed to set up profile (auth user was still created -- clean it up manually if needed):", profileErr.message);
    process.exit(1);
  }

  const plaintextKey = generatePlatformKey(tier);
  const keyHash = hashApiKey(plaintextKey);
  const keyPrefix = plaintextKey.slice(0, KEY_PREFIX_LENGTH);
  const { error: keyErr } = await supabase
    .from("platform_api_keys")
    .insert({ user_id: userId, name: "Demo trial key", tier, key_prefix: keyPrefix, key_hash: keyHash });
  if (keyErr) {
    console.error("Profile created, but failed to create the platform API key:", keyErr.message);
  }

  // One sample client project so the account isn't a blank slate on first
  // login -- demonstrates the multi-tenant project-tagging feature instead
  // of making a brand-new demo user discover it from zero.
  const { error: projectErr } = await supabase
    .from("client_projects")
    .insert({ user_id: userId, name: "Sample Client Project" });
  if (projectErr) {
    console.error("Profile created, but failed to create the sample client project:", projectErr.message);
  }

  console.log(`
Demo account created for ${email}

  Dashboard login:
    URL:      <your deployed app>/login
    Email:    ${email}
    Password: ${password}

  API key (for programmatic testing, shown once):
    ${plaintextKey}

  Plan: ${tier}, ${credits} credits, expires ${planExpiresAt}

Save this now -- the password and key are not recoverable after this. To
end access early: node --env-file=.env.local scripts/demo-account.mjs revoke --email ${email}
`);
}

async function revoke(opts) {
  const email = opts.email;
  if (!email) {
    console.error("Usage: revoke --email <email>");
    process.exit(1);
  }
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`No user found with email ${email}.`);
    process.exit(1);
  }

  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ is_active: false })
    .eq("id", user.id);
  if (profileErr) {
    console.error("Failed to deactivate profile:", profileErr.message);
    process.exit(1);
  }

  const { error: keyErr } = await supabase
    .from("platform_api_keys")
    .update({ is_active: false })
    .eq("user_id", user.id);
  if (keyErr) {
    console.error("Profile deactivated, but failed to deactivate platform API key(s):", keyErr.message);
  }

  console.log(`Revoked demo access for ${email} (dashboard login and API key both deactivated immediately).`);
}

const { command, opts } = parseArgs(process.argv.slice(2));
if (command === "create") await create(opts);
else if (command === "revoke") await revoke(opts);
else {
  console.error("Usage:\n  demo-account.mjs create --email <email> [--name <name>] [--days 14] [--credits 200] [--tier pro]\n  demo-account.mjs revoke --email <email>");
  process.exit(1);
}
