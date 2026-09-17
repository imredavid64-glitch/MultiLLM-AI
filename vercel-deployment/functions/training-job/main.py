"""Vercel Python Function: Training Job Endpoint"""

from __future__ import annotations

import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="MultiLLM Training API")

# Internal-only Vercel function -- called by this project's own Next.js API
# routes server-side, never directly by a browser. Reject anything that
# doesn't present the shared secret.
INTERNAL_API_SECRET = os.environ.get("INTERNAL_API_SECRET", "")

# Set project-wide in vercel-deployment/vercel.json's env block, so these are
# already available to this function without any extra config -- used to
# write job completion back to the same `training_jobs` row the Next.js side
# created, since this process's own in-memory `training_jobs` dict (below)
# uses a completely separate id space and isn't visible to the dashboard.
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def _parse_final_loss(logs: str) -> Optional[float]:
    """Best-effort extraction of the last validation metric this run actually
    printed (val_loss=... for the generator/refiner, val_mse=... for the
    scorer) -- real data pulled from the run's own log output, never a guess.
    """
    matches = re.findall(r"val_(?:loss|mse)=([\d.]+|inf)", logs)
    if not matches:
        return None
    last = matches[-1]
    if last == "inf":
        return None
    try:
        return float(last)
    except ValueError:
        return None


def _update_supabase_job(supabase_job_id: Optional[str], fields: Dict[str, Any]) -> None:
    if not supabase_job_id or not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return
    try:
        import httpx as _httpx

        with _httpx.Client(timeout=10.0) as client:
            response = client.patch(
                f"{SUPABASE_URL}/rest/v1/training_jobs",
                params={"id": f"eq.{supabase_job_id}"},
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                },
                json=fields,
            )
            response.raise_for_status()
    except Exception as exc:
        # A failed write-back shouldn't crash the training run itself -- the
        # job just stays at its last-known Supabase status (e.g. "running")
        # until a future run or manual fix updates it.
        print(f"[training] failed to update Supabase job {supabase_job_id}: {exc}")


@app.middleware("http")
async def require_internal_secret(request: Request, call_next):
    if request.url.path == "/api/health":
        return await call_next(request)
    provided = request.headers.get("x-internal-secret", "")
    if not INTERNAL_API_SECRET or provided != INTERNAL_API_SECRET:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


training_jobs: Dict[str, Dict[str, Any]] = {}


class TrainingRequest(BaseModel):
    kind: str = "both"
    epochs: int = 20
    batch_size: int = 16
    lr: float = 3e-3
    block_size: int = 512
    vocab_size: int = 4096
    seed: int = 42
    n_layer: int = 6
    n_head: int = 4
    n_embd: int = 128
    cpu: bool = True
    # The Supabase training_jobs.id this run corresponds to, so completion
    # can be written back to the row the dashboard actually reads. Optional
    # only for direct/manual calls to this function outside the Next.js flow.
    supabase_job_id: Optional[str] = None


class TrainingResponse(BaseModel):
    job_id: str
    status: str
    message: str


def run_training(job_id: str, params: TrainingRequest):
    training_jobs[job_id] = {
        "status": "running",
        "started_at": time.time(),
        "logs": "Starting training...\n",
        "params": params.model_dump(),
    }

    try:
        # Import and run training
        from train.train import main as train_main
        import sys

        # Capture stdout/stderr
        import io
        from contextlib import redirect_stdout, redirect_stderr

        output_buffer = io.StringIO()
        error_buffer = io.StringIO()

        sys.argv = [
            "train.py",
            "--kind",
            params.kind,
            "--epochs",
            str(params.epochs),
            "--batch-size",
            str(params.batch_size),
            "--lr",
            str(params.lr),
            "--block-size",
            str(params.block_size),
            "--vocab-size",
            str(params.vocab_size),
            "--seed",
            str(params.seed),
            "--n-layer",
            str(params.n_layer),
            "--n-head",
            str(params.n_head),
            "--n-embd",
            str(params.n_embd),
        ]
        if params.cpu:
            sys.argv.append("--cpu")

        with redirect_stdout(output_buffer), redirect_stderr(error_buffer):
            train_main()

        logs = output_buffer.getvalue() + error_buffer.getvalue()
        final_loss = _parse_final_loss(logs)
        training_jobs[job_id].update(
            {
                "status": "completed",
                "completed_at": time.time(),
                "logs": logs,
                "final_loss": final_loss,
            }
        )
        _update_supabase_job(
            params.supabase_job_id,
            {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "logs": logs[:20000],
                "final_loss": final_loss,
            },
        )

    except Exception as e:
        error_logs = training_jobs[job_id]["logs"] + f"\nError: {str(e)}"
        training_jobs[job_id].update(
            {
                "status": "failed",
                "completed_at": time.time(),
                "logs": error_logs,
            }
        )
        _update_supabase_job(
            params.supabase_job_id,
            {
                "status": "failed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "logs": error_logs[:20000],
            },
        )


@app.post("/api/training/start", response_model=TrainingResponse)
async def start_training(request: TrainingRequest, background_tasks: BackgroundTasks):
    import uuid

    job_id = str(uuid.uuid4())[:8]

    background_tasks.add_task(run_training, job_id, request)

    return TrainingResponse(
        job_id=job_id, status="pending", message="Training job started. Poll /api/training/status/{job_id} for updates."
    )


@app.get("/api/training/status/{job_id}")
async def get_training_status(job_id: str):
    if job_id not in training_jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = training_jobs[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "logs": job["logs"],
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
        "params": job.get("params"),
    }


@app.get("/api/training/jobs")
async def list_training_jobs():
    return {"jobs": training_jobs}


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "training-job"}
