"""Vercel Python Function: Multi-LLM Ensemble Query Endpoint"""
from __future__ import annotations

import logging
import os
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from ai_client import (
    build_provider_stack,
    SourceIndex,
    build_ensemble_answer,
    maybe_refine_prompt,
    GenerationConfig,
    format_sources_for_user,
    format_provider_status,
    SOURCES_DIR,
    MAX_PARALLEL_BOTS,
    parse_int_env,
    parse_bool_env,
)
from token_optimizer import estimate_tokens

# Rough, published-order-of-magnitude estimate (not a measured value) used to
# turn real token counts into an illustrative gCO2 figure. There is no actual
# per-provider energy metering in this stack; presenting this as more precise
# than "estimate" would just be a fancier fabrication.
CARBON_G_PER_1K_TOKENS = 0.5

logger = logging.getLogger("query_ensemble")
if not logger.handlers:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI(title="MultiLLM Ensemble API")

# This function is a Vercel serverless function meant to be called ONLY by
# this project's own Next.js API routes (server-side), never directly by a
# browser. It carries no user-facing auth of its own, so it must reject any
# request that doesn't present the shared secret the Next.js side attaches.
INTERNAL_API_SECRET = os.environ.get("INTERNAL_API_SECRET", "")
APP_ORIGIN = os.environ.get("APP_ORIGIN", "")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[APP_ORIGIN] if APP_ORIGIN else [],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "x-internal-secret"],
)


@app.middleware("http")
async def require_internal_secret(request: Request, call_next):
    if request.url.path == "/api/health":
        return await call_next(request)
    provided = request.headers.get("x-internal-secret", "")
    if not INTERNAL_API_SECRET or provided != INTERNAL_API_SECRET:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


# Defense-in-depth backstop: the Next.js layer already enforces tier-aware
# per-user limits before it ever calls this function, so this only needs a
# coarse per-caller cap in case that layer is bypassed or misbehaves (e.g. a
# retry storm). In-memory, per-process -- not distributed.
_rate_buckets: Dict[str, Dict[str, float]] = {}
_RATE_WINDOW_SECONDS = 60.0
QUERY_RATE_LIMIT_PER_MINUTE = parse_int_env("QUERY_RATE_LIMIT_PER_MINUTE", default=1000, minimum=1, maximum=100000)


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    request.state.request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["x-request-id"] = request.state.request_id
    return response


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if request.url.path == "/api/health":
        return await call_next(request)
    import time as _time

    now = _time.time()
    key = _client_key(request)
    bucket = _rate_buckets.get(key)
    if bucket is None or now >= bucket["reset_at"]:
        _rate_buckets[key] = {"count": 1.0, "reset_at": now + _RATE_WINDOW_SECONDS}
    else:
        bucket["count"] += 1
        if bucket["count"] > QUERY_RATE_LIMIT_PER_MINUTE:
            retry_after = max(1, int(bucket["reset_at"] - now))
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"},
                headers={"Retry-After": str(retry_after)},
            )
    return await call_next(request)


providers = build_provider_stack()
source_index = SourceIndex(SOURCES_DIR)
source_index.refresh()

BOT_COUNT = parse_int_env("BOT_COUNT", default=4, minimum=2, maximum=MAX_PARALLEL_BOTS)
PRIVACY_REDACTION = parse_bool_env("PRIVACY_REDACTION", True)

class QueryRequest(BaseModel):
    prompt: str
    bot_count: Optional[int] = None
    top_k: Optional[int] = 6
    privacy_redaction: Optional[bool] = None
    save_history: Optional[bool] = False
    # Caller's own decrypted provider keys (BYO), grouped by provider name.
    # Only ever logged by key, never by value -- see build_provider_stack().
    provider_keys: Optional[Dict[str, List[str]]] = None

class CandidateResponse(BaseModel):
    bot_name: str
    provider_name: str
    source_score: float
    bias_score: float
    clarity_score: float
    total_score: float
    text: str

class QueryResponse(BaseModel):
    answer: str
    candidates: List[CandidateResponse]
    sources: List[Dict[str, Any]]
    metrics: Dict[str, float]
    provider_status: str
    providers_used: List[str] = []
    refined_prompt: Optional[str] = None
    token_savings: Optional[Dict[str, float]] = None
    request_id: Optional[str] = None

@app.post("/api/query", response_model=QueryResponse)
async def query_ensemble(request: QueryRequest, http_request: Request):
    request_id = getattr(http_request.state, "request_id", None) or str(uuid.uuid4())

    # BYO keys: build a per-request stack that prefers the caller's own
    # provider keys, falling back to the platform's for any provider they
    # haven't connected. Never build this once at module scope -- it must
    # never be shared across requests/users. request.provider_keys itself is
    # never logged (only which providers ended up in use, by name).
    request_providers = providers
    if request.provider_keys:
        request_providers = build_provider_stack(user_keys=request.provider_keys) or providers

    if not request_providers:
        raise HTTPException(status_code=503, detail="No providers configured. Set API keys.")

    bot_count = request.bot_count or BOT_COUNT
    bot_count = max(2, min(MAX_PARALLEL_BOTS, bot_count))

    privacy_redaction = request.privacy_redaction if request.privacy_redaction is not None else PRIVACY_REDACTION

    try:
        start = time.perf_counter()
        refined_prompt = maybe_refine_prompt(request.prompt)
        sources = source_index.retrieve(refined_prompt, top_k=request.top_k or 6)
        answer, candidates, token_savings = build_ensemble_answer(
            providers=request_providers,
            history=[],
            user_input=refined_prompt,
            sources=sources,
            bot_count=bot_count,
            privacy_redaction=privacy_redaction,
        )
        latency_ms = (time.perf_counter() - start) * 1000

        # Real per-query token accounting (not a guess): the optimized
        # context each bot actually received, times how many bots ran, plus
        # every candidate's output and the final synthesized answer.
        context_tokens = token_savings.get("tokens_after", 0) * bot_count
        output_tokens = sum(estimate_tokens(c.text) for c in candidates) + estimate_tokens(answer)
        total_tokens = context_tokens + output_tokens
        emissions_g = round(total_tokens / 1000 * CARBON_G_PER_1K_TOKENS, 4)
        carbon_saved_g = round(token_savings.get("tokens_saved", 0) / 1000 * CARBON_G_PER_1K_TOKENS, 4)
        providers_used = sorted({c.provider_name for c in candidates})

        return QueryResponse(
            answer=answer,
            candidates=[
                CandidateResponse(
                    bot_name=c.bot_name,
                    provider_name=c.provider_name,
                    source_score=c.source_score,
                    bias_score=c.bias_score,
                    clarity_score=c.clarity_score,
                    total_score=c.total_score,
                    text=c.text,
                )
                for c in candidates
            ],
            sources=[
                {"source_id": s.source_id, "path": str(s.path), "text": s.text[:200]}
                for s in sources
            ],
            metrics={
                "source_support": round(sum(c.source_score for c in candidates) / len(candidates), 3) if candidates else 0,
                "bias": round(sum(c.bias_score for c in candidates) / len(candidates), 3) if candidates else 0,
                "clarity": round(sum(c.clarity_score for c in candidates) / len(candidates), 3) if candidates else 0,
                "top_score": round(candidates[0].total_score, 3) if candidates else 0,
                "latency_ms": round(latency_ms, 1),
                "carbon_saved_g": carbon_saved_g,
                "emissions_g": emissions_g,
            },
            provider_status=format_provider_status(request_providers),
            providers_used=providers_used,
            refined_prompt=refined_prompt if refined_prompt != request.prompt else None,
            token_savings=token_savings,
            request_id=request_id,
        )
    except Exception as e:
        logger.error("request %s failed: %s", request_id, e)
        raise HTTPException(status_code=500, detail=f"{e} (request_id={request_id})")

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "providers": len(providers),
        "sources": len(source_index.loaded_files),
        "provider_status": format_provider_status(providers),
    }

@app.post("/api/reload-sources")
async def reload_sources():
    global source_index
    source_index = SourceIndex(SOURCES_DIR)
    source_index.refresh()
    return {"status": "ok", "files": len(source_index.loaded_files), "chunks": len(source_index.chunks)}