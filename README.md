# MultiLLM — Ensemble AI SaaS Platform

One prompt. Multiple LLMs. The best answer, automatically selected.

MultiLLM runs a multi-bot answer ensemble: several independent models answer
your question in parallel, each candidate is scored for **source support**,
**bias**, and **clarity**, and the best parts are merged into one balanced,
cited answer. The platform also trains its own tiny models from scratch for
fully offline inference and answer-quality scoring.

## Live

- SaaS app: https://multillm-three.vercel.app
- Works in **demo mode** (any email + 6-char password) until the Appwrite
  database is provisioned.

## Repo layout

```
ai_client.py              Core ensemble engine (parallel bots, scoring, synthesis)
local_models.py           Trained-model integration (offline candidate + scorer)
ensemble_demo.py          Offline demo: run the ensemble with no API keys
train/
  dataset.py              Synthetic corpus generator (ensemble answering style)
  model.py                TinyGPT (generator) + TinyScorer (regressor), from scratch
  train.py                CLI to train both models (MPS/CPU, no downloads)
models/                   Trained artifacts (reproducible via train.train)
knowledge_sources/        Local docs used for retrieval-grounded answers
vercel-deployment/        Next.js 14 SaaS (dashboard, auth, API keys, billing, analytics, training)
```

## Quickstart

### 1. Run the offline ensemble (no API keys)

```bash
python3 ensemble_demo.py "How does a multi-LLM ensemble improve answer quality?"
python3 ensemble_demo.py --sources "Your question here"
```

### 2. Train the tiny models (from scratch, a few minutes on Apple Silicon)

```bash
python3 -m train.dataset    # rebuild synthetic corpus + scorer labels
python3 -m train.train      # train generator + scorer -> models/  (uses MPS)
```

Both models use a word-level tokenizer (~1,100 vocab) trained on a synthetic
corpus of ~2,300 chat-style documents (~2.7M characters) built from 40 domain
concepts, each with multiple question phrasings, so the generator learns answer
style rather than memorizing exact questions. Set `--cpu` to force CPU, or pass
`--epochs N` / `--batch-size N` / `--n-layer N` / `--n-embd N` to tune.

Evaluate generalization on held-out questions with:

```bash
python3 -m train.eval_generator
```

### 3. Use remote providers (optional)

Set at least one key set in `.env` (never commit it):

```
OPENAI_API_KEYS=sk-...            # or OPENAI_API_KEY (OpenRouter: sk-or-v1-...)
GEMINI_API_KEY=...
MISTRAL_API_KEY=...
```

Then run the full ensemble with the trained local model plus remote providers:

```bash
python3 ai_client.py
```

### 4. Run the SaaS (Next.js)

```bash
cd vercel-deployment
npm install
npm run dev
```

Set `NEXT_PUBLIC_APPWRITE_ENDPOINT` and `NEXT_PUBLIC_APPWRITE_PROJECT_ID` to
enable real authentication and persistence. Without them, the app runs in
**demo mode** (localStorage-backed auth) so everything is still testable.

## How the ensemble works

1. **Parallel bots** — N personas (Factual Analyst, Skeptical Reviewer, Neutral
   Teacher, ...) each answer via a provider.
2. **Scoring** — every candidate is scored: source support (citation + token
   overlap), bias (absolute-word penalty + framing), clarity (length/structure).
   The trained `TinyScorer` blends 50/50 with the heuristics when present.
3. **Synthesis** — the top candidates are merged by a judge step that keeps only
   supported claims, preserves tradeoffs, and explains conflicts.
4. **Privacy** — prompts/answers are redacted for sensitive patterns (emails,
   keys, cards, SSNs) before any remote API call.

## Local models

- **ensemble-generator** — TinyGPT (6-layer decoder, ~1.4M params) trained from
  random weights on the synthetic ensemble corpus with a word-level tokenizer
  (block size 512, so full prompts fit in context). Acts as an offline
  candidate and privacy-preserving fallback.
- **ensemble-scorer** — regresses (source_support, bias_score, clarity_score),
  blended 50/50 with heuristic scoring. Uses its own tokenizer
  (`models/scorer-tokenizer.json`).

Both train with `python -m train.train` — no downloads, no API keys.

## Roadmap

- [x] Ensemble engine + heuristic scoring
- [x] Tiny models trained from scratch (offline candidate + scorer)
- [x] SaaS dashboard (login, API keys, analytics, billing, settings, training)
- [x] Demo mode (usable before backend is wired)
- [ ] Provision Appwrite: project, collections, functions, real auth + persistence
- [ ] Wire training page to real job execution

## License

MIT
