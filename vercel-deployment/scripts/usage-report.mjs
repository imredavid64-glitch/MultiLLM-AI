#!/usr/bin/env node
// Admin-only CLI: prints a per-account usage summary for the last 7 and 30
// days (queries, errors, credits left, estimated provider cost). Not part of
// the deployed app -- run locally by you, same style/invocation as
// scripts/demo-account.mjs:
//
//   node --env-file=.env.local scripts/usage-report.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment (e.g. `vercel env pull .env.local` first).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run `vercel env pull .env.local` first, then re-run this with:\n" +
      "  node --env-file=.env.local scripts/usage-report.mjs",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOWS = [
  { label: "7d", sinceMs: 7 * DAY_MS },
  { label: "30d", sinceMs: 30 * DAY_MS },
];

async function fetchAllProfiles() {
  // Paged the same way demo-account.mjs pages auth users -- fine at this
  // scale (admin reporting, not a high-frequency hot path).
  const profiles = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, name, plan, credits")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    profiles.push(...data);
    if (data.length < pageSize) break;
  }
  return profiles;
}

async function fetchAllRows(table, columns, sinceIso) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .gte("created_at", sinceIso)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

function summarize(rows, sinceMs, now, pickCost) {
  const cutoff = now - sinceMs;
  const byUser = new Map();
  for (const row of rows) {
    if (new Date(row.created_at).getTime() < cutoff) continue;
    const entry = byUser.get(row.user_id) || { count: 0, costUsd: 0 };
    entry.count += 1;
    if (pickCost) entry.costUsd += pickCost(row) || 0;
    byUser.set(row.user_id, entry);
  }
  return byUser;
}

async function main() {
  const now = Date.now();
  const oldestSinceIso = new Date(now - Math.max(...WINDOWS.map((w) => w.sinceMs))).toISOString();

  const [profiles, queries, errors] = await Promise.all([
    fetchAllProfiles(),
    fetchAllRows("queries", "user_id, created_at, estimated_cost_usd", oldestSinceIso),
    fetchAllRows("query_errors", "user_id, created_at", oldestSinceIso),
  ]);

  const windowStats = WINDOWS.map((w) => ({
    label: w.label,
    queriesByUser: summarize(queries, w.sinceMs, now, (r) => r.estimated_cost_usd),
    errorsByUser: summarize(errors, w.sinceMs, now),
  }));

  console.log(`Usage report -- ${new Date(now).toISOString()}\n`);

  for (const profile of profiles) {
    const label = profile.email || profile.id;
    console.log(`${label} (${profile.plan}, ${profile.credits} credits left)`);
    for (const w of windowStats) {
      const q = w.queriesByUser.get(profile.id) || { count: 0, costUsd: 0 };
      const e = w.errorsByUser.get(profile.id) || { count: 0 };
      console.log(
        `  last ${w.label}: ${q.count} queries, ${e.count} errors, est. cost $${q.costUsd.toFixed(4)}`,
      );
    }
  }

  const totalCost30d = [...windowStats.find((w) => w.label === "30d").queriesByUser.values()].reduce(
    (sum, v) => sum + v.costUsd,
    0,
  );
  console.log(`\n${profiles.length} accounts. Total estimated provider cost, last 30d: $${totalCost30d.toFixed(2)}`);
}

main().catch((err) => {
  console.error("Usage report failed:", err.message || err);
  process.exit(1);
});
