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
- **Stripe** account (for billing)
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

### 2. Configure Stripe
1. Create products/prices in Stripe Dashboard
2. Set price IDs in `src/app/api/stripe-webhook/route.ts` → `getPlanFromPriceId()`
3. Add webhook endpoint: `https://your-app.vercel.app/api/stripe-webhook`
4. Subscribe to events: `customer.subscription.*`, `invoice.payment_*`

### 3. Deploy to Vercel
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
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENCRYPTION_KEY
OPENAI_API_KEY (optional)
GEMINI_API_KEY (optional)
MISTRAL_API_KEY (optional)
```

### 4. Generate Encryption Key
```bash
python -c "import secrets, base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```
Add output as `ENCRYPTION_KEY` in Vercel.

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│  Supabase        │────▶│  Stripe         │
│   (Vercel)      │     │  (Auth, DB,      │     │  (Billing)      │
│                 │     │   Storage,       │     │                 │
└─────────────────┘     │   Realtime)      │     └─────────────────┘
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
- **subscriptions** - Stripe subscription sync

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
- `POST /api/query` - Run ensemble query (proxies to Python function)
- `POST /api/training` - Start training job
- `POST /api/stripe-webhook` - Stripe webhook handler
- `GET /api/queries` - Get user query history
- `GET /api/api-keys` - Get user API keys
- `POST /api/api-keys` - Add API key
- `GET /api/subscription` - Get user subscription

### Python Functions (Vercel)
- `POST /api/query` - Direct ensemble query
- `GET /api/health` - Health check
- `POST /api/reload-sources` - Reload knowledge sources
- `POST /api/training/start` - Start training
- `GET /api/training/status/{job_id}` - Check training status

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key |
| `ENCRYPTION_KEY` | Yes | 32-byte base64 key for API encryption |
| `OPENAI_API_KEY` | No | OpenAI/OpenRouter API key |
| `GEMINI_API_KEY` | No | Google Gemini API key |
| `MISTRAL_API_KEY` | No | Mistral API key |
| `BOT_COUNT` | No | Parallel bots (default: 4) |
| `PRIVACY_REDACTION` | No | Enable PII redaction (default: 1) |

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
- **Stripe**: Webhook delivery logs in Stripe Dashboard > Developers > Webhooks

---

## Troubleshooting

### "No providers configured"
Set at least one provider API key in environment variables.

### "Trained model not found"
Run `python -m train.train` to generate local models.

### Supabase connection failed
Check `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Ensure RLS policies allow the operations.

### Stripe webhook fails
Verify webhook URL is accessible and `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard.

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
- [ ] Stripe webhook signature verification enabled
- [ ] API keys encrypted at rest (using `encryption.py`)
- [ ] PII redaction enabled (`PRIVACY_REDACTION=1`)
- [ ] HTTPS enforced (Vercel default)
- [ ] CORS configured for your domain only
- [ ] Rate limiting on `/api/query` endpoint
- [ ] RLS policies tested for all tables