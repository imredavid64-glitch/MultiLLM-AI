"""Vercel Python Function: Multi-LLM Ensemble Query Endpoint"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from ai_client import (
    build_provider_stack,
    SourceIndex,
    build_ensemble_answer,
    GenerationConfig,
    format_sources_for_user,
    format_provider_status,
    SOURCES_DIR,
    MAX_PARALLEL_BOTS,
    parse_int_env,
    parse_bool_env,
)

app = FastAPI(title="MultiLLM Ensemble API")

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

@app.post("/api/query", response_model=QueryResponse)
async def query_ensemble(request: QueryRequest):
    if not providers:
        raise HTTPException(status_code=503, detail="No providers configured. Set API keys.")
    
    bot_count = request.bot_count or BOT_COUNT
    bot_count = max(2, min(MAX_PARALLEL_BOTS, bot_count))
    
    privacy_redaction = request.privacy_redaction if request.privacy_redaction is not None else PRIVACY_REDACTION
    
    try:
        sources = source_index.retrieve(request.prompt, top_k=request.top_k or 6)
        answer, candidates = build_ensemble_answer(
            providers=providers,
            history=[],
            user_input=request.prompt,
            sources=sources,
            bot_count=bot_count,
            privacy_redaction=privacy_redaction,
        )
        
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
            },
            provider_status=format_provider_status(providers),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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