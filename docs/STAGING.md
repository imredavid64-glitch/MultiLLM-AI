# Staging environment setup

This covers running a second, fully isolated copy of the app against its own
Supabase project, deployed as a Vercel preview environment, so changes can be
verified against real infrastructure before they reach production.

## 1. Create a staging Supabase project

1. In the Supabase dashboard, create a new project (e.g. `multillm-staging`).
   Pick any region -- it does not need to match production.
2. Open its SQL Editor and run `supabase/schema.sql` from this repo, top to
   bottom, exactly as committed. It's written to apply cleanly to a brand-new,
   empty project (every statement is `IF NOT EXISTS` / `OR REPLACE` / guarded
   `DROP ... IF EXISTS`) -- no edits needed.
3. If you want the optional Storage buckets, uncomment and run the
   `INSERT INTO storage.buckets ...` block at the bottom of `schema.sql` (left
   commented out by default since not every environment needs file storage).
4. From the new project's Settings, grab:
   - Project URL -> `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key -> `SUPABASE_SERVICE_ROLE_KEY`

Never point staging at the production Supabase project, and never copy the
production `service_role` key into a staging environment variable.

## 2. Create a Vercel preview environment pointed at it

This repo deploys via Vercel's GitHub integration, which auto-builds a preview
deployment for every branch/PR. To make a *stable* staging URL that always
uses the staging Supabase project (rather than a one-off preview per PR):

1. In the Vercel project, create a dedicated `staging` branch in git.
2. In Vercel project Settings -> Environment Variables, add the vars below
   scoped to **Preview** (optionally narrowed further to the `staging` branch
   under "Branch Tracking" so other preview branches don't pick them up).
3. Push to the `staging` branch to deploy; Vercel gives it a stable
   `https://<project>-git-staging-<team>.vercel.app` URL.

## 3. Which env vars differ from production

Everything in `.env.example` applies to both; these are the ones that must
hold **different values** per environment:

| Variable | Production | Staging |
|---|---|---|
| `APP_ENV` | `production` | `staging` |
| `NEXT_PUBLIC_SUPABASE_URL` | prod project | staging project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod project | staging project |
| `SUPABASE_SERVICE_ROLE_KEY` | prod project | staging project |
| `INTERNAL_API_SECRET` | its own random value | a *different* random value |
| `ENCRYPTION_KEY` | its own 32-byte key | a *different* 32-byte key (staging-encrypted API keys must never be decryptable with the production key, or vice versa) |
| `APP_ORIGIN` | production domain | staging's Vercel preview URL |
| Provider API keys (`OPENAI_API_KEY`, etc.) | real/paid keys | separate keys or low-limit test keys, so staging traffic never burns production quota/budget |
| `DAILY_PROVIDER_SPEND_CAP_USD` | your real cap | a small cap, so a staging bug can't run up a real bill |
| `RESEND_API_KEY` / `EMAIL_FROM` | real sending account | a Resend test-mode key, or leave unset (emails log to the console instead -- see `src/lib/email.ts`) |
| `CRON_SECRET` | its own random value | a *different* random value |

Everything else (`BOT_COUNT`, `PRIVACY_REDACTION`, rate-limit tunables,
`QUERY_RATE_LIMIT_PER_MINUTE`, etc.) can reasonably stay the same in both.

Note: `next.config.js` hard-fails a build when `VERCEL_ENV === "production"`
and `NEXT_PUBLIC_CONTACT_EMAIL` is unset. Vercel sets `VERCEL_ENV` to
`"preview"` for the staging branch, so this check doesn't block staging
builds even if you leave that var pointed at the same support inbox.

## 4. Promoting a change from staging to production

1. Open a PR into `main` as usual; Vercel's preview build for the PR runs
   against the PR's own (ephemeral) preview deployment, not the stable
   staging URL above -- use the staging URL for manual verification before or
   after opening the PR, whichever fits your workflow.
2. Once verified on staging and the PR is merged to `main`, Vercel's
   production deployment picks it up automatically.
3. If the change includes a schema migration, apply the same SQL to the
   production Supabase project (via its own SQL Editor) before or immediately
   after the code deploys, depending on whether the new code requires the
   column/table to already exist. Never run staging's schema changes against
   production automatically -- always apply deliberately, reviewing the SQL
   first.
