"""Vercel Python Function: Training Job Endpoint"""
from __future__ import annotations

import os
import sys
import json
import time
import threading
from pathlib import Path
from typing import Optional, Dict, Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel

app = FastAPI(title="MultiLLM Training API")

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
        import argparse
        import sys
        
        # Capture stdout/stderr
        import io
        from contextlib import redirect_stdout, redirect_stderr
        
        output_buffer = io.StringIO()
        error_buffer = io.StringIO()
        
        sys.argv = [
            'train.py',
            '--kind', params.kind,
            '--epochs', str(params.epochs),
            '--batch-size', str(params.batch_size),
            '--lr', str(params.lr),
            '--block-size', str(params.block_size),
            '--vocab-size', str(params.vocab_size),
            '--seed', str(params.seed),
            '--n-layer', str(params.n_layer),
            '--n-head', str(params.n_head),
            '--n-embd', str(params.n_embd),
        ]
        if params.cpu:
            sys.argv.append('--cpu')
        
        with redirect_stdout(output_buffer), redirect_stderr(error_buffer):
            train_main()
        
        logs = output_buffer.getvalue() + error_buffer.getvalue()
        training_jobs[job_id].update({
            "status": "completed",
            "completed_at": time.time(),
            "logs": logs,
            "final_loss": None,  # Could parse from logs
        })
        
    except Exception as e:
        training_jobs[job_id].update({
            "status": "failed",
            "completed_at": time.time(),
            "logs": training_jobs[job_id]["logs"] + f"\nError: {str(e)}",
        })

@app.post("/api/training/start", response_model=TrainingResponse)
async def start_training(request: TrainingRequest, background_tasks: BackgroundTasks):
    import uuid
    job_id = str(uuid.uuid4())[:8]
    
    background_tasks.add_task(run_training, job_id, request)
    
    return TrainingResponse(
        job_id=job_id,
        status="pending",
        message="Training job started. Poll /api/training/status/{job_id} for updates."
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