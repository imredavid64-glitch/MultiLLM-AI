# MultiLLM Deployment Guide (Supabase)

## Quick Start (Local Development)

### 1. Python Ensemble (Offline)
```bash
# Install dependencies
pip install openai httpx torch numpy

# Test offline ensemble (uses trained models if available)
python ensemble_demo.py "Your question here"

# Train local models (optional, ~5-10 min on MPS/CPU)
python -m train.train --epochs 20 --batch-size 8 --cpu

# Run desktop GUI
python ai_client_app.py
```

### 2. SaaS Frontend (Next.js + Vercel)
```bash
cd vercel-deployment

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Edit .env.local with your keys

# Run development server
npm run dev
```

Visit `http://localhost:3000` - works in **demo mode** without Supabase.

---

## Production Deployment

### Prerequisites
- **Supabase** project
- **Vercel** account
- **GitHub** repository

### 1. Provision Supabase
```bash
# 1. Create project at https://supabase.com
# 2. Go to SQL Editor and run supabase/schema.sql
# 3. Go to Storage and create buckets:
#    - model-artifacts (private, 100MB limit)
#    - knowledge-sources (private, 50MB limit)
# 4. Get credentials from Settings > API:
#    - Project URL
#    - anon/public key
#    - service_role key (secret)
```

### 2. Deploy to Vercel
```bash
# Via Vercel CLI
vercel --prod

# Or connect GitHub repo in Vercel Dashboard
# Set environment variables in Vercel Project Settings
```

Required Vercel Environment Variables:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ENCRYPTION_KEY
NEXT_PUBLIC_CONTACT_EMAIL
OPENAI_API_KEY (optional)
GEMINI_API_KEY (optional)
MISTRAL_API_KEY (optional)
```

### 3. Generate Encryption Key
```bash
python -c "import secrets, base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```
Add output as `ENCRYPTION_KEY` in Vercel.

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│   Next.js App   │────▶│  Supabase        │
│   (Vercel)      │     │  (Auth, DB,      │
│                 │     │   Storage,       │
└─────────────────┘     │   Realtime)      │
                        └────────┬─────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
            ┌───────────────┐         ┌───────────────┐
            │ Query Ensemble│         │ Training Job  │
            │ (Python Fn)   │         │ (Python Fn)   │
            └───────────────┘         └───────────────┘
                    │
                    ▼
         ┌────────────────────────┐
         │ Multi-LLM Ensemble     │
         │ - OpenAI/Gemini/Mistral│
         │ - Local TinyGPT        │
         │ - Scoring + Synthesis  │
         └────────────────────────┘
```

---

## Supabase Schema Overview

### Tables
- **profiles** - Extended user info (plan, credits, etc.)
- **api_keys** - Encrypted user API keys
- **queries** - Query history with full traceability
- **training_jobs** - Training job tracking
- **subscriptions** - Plan/subscription state (updated manually, not by a payment processor -- see billing note below)

### Row Level Security
All tables have RLS enabled with policies:
- Users can only access their own data
- Service role (backend) has full access

### Storage Buckets
- **model-artifacts** - Trained model files (.pt, .json)
- **knowledge-sources** - User uploaded documents

---

## API Endpoints

### Next.js (Frontend)
- `POST /api/query` / `GET /api/query` - Run ensemble query (proxies to Python function) / model+health status
- `GET /api/training` / `POST /api/training` - List / start training jobs (real Supabase-backed, user-scoped)
- `GET /api/api-keys` / `POST /api/api-keys` - List / create platform API keys
- `DELETE /api/api-keys/[id]` - Revoke a platform API key
- `GET /api/analytics` - Query history + usage analytics
- `GET /api/client-projects` / `POST /api/client-projects` - Multi-tenant client project CRUD
- `GET /api/account` / `DELETE /api/account` - Account info / delete account

**Billing:** there is no payment processor and no billing API route. Every
plan change (upgrade/downgrade/cancellation) and billing question is a
`mailto:` link to `NEXT_PUBLIC_CONTACT_EMAIL`, handled manually. The
`subscriptions` table's `plan`/`status`/`credits_included` columns are
updated by hand (e.g. via the Supabase dashboard or a script) when a
request is fulfilled.

### Python Functions (Vercel)
`query-ensemble` is deployed as a Vercel **Service** (`vercel-deployment/vercel.json`'s
`services` block), not a plain function under `api/` -- Next.js's App Router
claims the entire `/api/*` namespace for itself, so a sibling Python
function placed directly under `api/` is silently unreachable in
production (confirmed empirically: it returns Next's own 404 page, never
invokes the Python function). The Next.js app calls it privately via a
service binding (`PYTHON_ENSEMBLE_INTERNAL_URL`, injected automatically by
Vercel -- never set it as a project env var), not a public URL. Its
dependencies (`ai_client.py`, `local_models.py`, `token_optimizer.py`,
`knowledge_sources/`) are vendored copies inside
`vercel-deployment/api/query-ensemble/`, kept in sync manually with the
repo-root originals, since this project's Vercel Root Directory is
`vercel-deployment/` and a deployed function can't read files above it.

- `POST /api/query` - Direct ensemble query
- `GET /api/health` - Health check
- `POST /api/reload-sources` - Reload knowledge sources
- `POST /api/training/start` - Start training
- `GET /api/training/status/{job_id}` - Check training status

**Known gap:** the `training-job` function is currently excluded from
production (`vercel-deployment/training-job-disabled/`, not under `api/`).
It needs `torch`, whose bundle exceeds the standard 500MB Python function
limit; enabling the large-functions beta hits what looks like a Vercel
platform bug (`ENOENT` on an installed package file, different file each
deploy attempt) at the final packaging step. Separately, real training runs
can exceed the Hobby plan's hard 300s function duration cap regardless. See
`vercel-deployment/training-job-disabled/DISABLED.md` for details and how to
restore it once resolved (or after upgrading to Pro).

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Yes | Sales/support inbox used in the footer and every billing mailto link (there is no payment processor) |
| `ENCRYPTION_KEY` | Yes | 32-byte base64 key for API encryption |
| `INTERNAL_API_SECRET` | Yes | Shared secret Next.js sends to the Python functions |
| `APP_ORIGIN` | Yes | Deployed app origin; CORS allow-list for the query-ensemble function |
| `PYTHON_TRAINING_URL` | Yes | URL of the deployed training-job Python function |
| `OPENAI_API_KEY` | No | OpenAI/OpenRouter API key |
| `GEMINI_API_KEY` | No | Google Gemini API key |
| `MISTRAL_API_KEY` | No | Mistral API key |
| `GROQ_API_KEY` | No | Groq API key |
| `BOT_COUNT` | No | Parallel bots (default: 4) |
| `PRIVACY_REDACTION` | No | Enable PII redaction (default: 1) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Strongly recommended in production | Shared, cross-instance rate limiting; without these, limits are per-serverless-instance only and far weaker under horizontal scaling |

---

## Local Development with Real Backend

1. Start Supabase locally:
```bash
npx supabase start
```

2. Run migrations:
```bash
npx supabase db reset
# or apply schema.sql manually in local dashboard
```

3. Start Next.js with local backend:
```bash
cd vercel-deployment
cp .env.example .env.local
# Edit .env.local with local Supabase credentials
npm run dev
```

---

## Testing

```bash
# Python tests
pytest

# Next.js tests
# NOTE: no test suite exists yet (`npm test` is undefined, so CI's
# `npm test --if-present` currently no-ops). Add one (e.g. Vitest) before
# relying on this.
cd vercel-deployment && npm test

# Linting
ruff check .           # Python
cd vercel-deployment && npm run lint  # TypeScript

# Type checking
mypy ai_client.py      # Python
cd vercel-deployment && npm run typecheck  # TypeScript

# Generate Supabase types
cd vercel-deployment && npm run db:generate-types
```

---

## Monitoring & Logs

- **Vercel**: Function logs in Vercel Dashboard
- **Supabase**: Logs in Supabase Dashboard > Logs

---

## Troubleshooting

### "No providers configured"
Set at least one provider API key in environment variables.

### "Trained model not found"
Run `python -m train.train` to generate local models.

### Supabase connection failed
Check `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Ensure RLS policies allow the operations.

### Python function timeout
Increase `maxDuration` in `vercel.json` (max 60s for query, 3600s for training).

---

## Scaling Considerations

- **Query Ensemble**: Stateless, horizontal scaling via Vercel Functions
- **Training Jobs**: Long-running, use Vercel Functions with 1hr timeout
- **Database**: Supabase handles scaling; add indexes for high query volume
- **Storage**: Model artifacts in Supabase Storage (100MB limit per file)
- **Rate Limiting**: Implement in Next.js middleware or Supabase Edge Functions

---

## Security Checklist

- [ ] `ENCRYPTION_KEY` is 32-byte base64, stored only in secure env
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only used server-side
- [ ] API keys encrypted at rest (using `encryption.py`)
- [ ] PII redaction enabled (`PRIVACY_REDACTION=1`)
- [ ] HTTPS enforced (Vercel default)
- [ ] CORS configured for your domain only
- [ ] Rate limiting on `/api/query` endpoint
- [ ] RLS policies tested for all tables