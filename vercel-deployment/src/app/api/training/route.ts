import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import registry from "@/lib/model-registry.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PYTHON_TRAINING_URL = process.env.PYTHON_TRAINING_URL || "http://localhost:8001";

interface Job {
  id: string;
  name: string;
  status: "pending" | "training" | "completed" | "failed";
  progress: number;
  baseModel: string;
  epochs: number;
  learningRate: number;
  createdAt: string;
  completedAt?: string;
  modelPath?: string;
  kind?: string;
  logs?: string;
}

let mockJobs: Job[] = [];

function seedJobs(): Job[] {
  if (mockJobs.length > 0) return mockJobs;
  const now = new Date();
  mockJobs = [
    {
      id: "job_generator",
      name: "TinyGPT ensemble-generator (from scratch)",
      status: "completed",
      progress: 100,
      baseModel: "scratch-tinygpt",
      epochs: 10,
      learningRate: 0.003,
      createdAt: now.toISOString(),
      completedAt: now.toISOString(),
      modelPath: "/models/ensemble-generator",
      kind: "generator",
    },
    {
      id: "job_scorer",
      name: "TinyScorer answer-quality regressor",
      status: "completed",
      progress: 100,
      baseModel: "scratch-tinygpt",
      epochs: 25,
      learningRate: 0.003,
      createdAt: now.toISOString(),
      completedAt: now.toISOString(),
      modelPath: "/models/ensemble-scorer",
      kind: "scorer",
    },
  ];
  return mockJobs;
}

async function callPythonTraining(endpoint: string, options: RequestInit = {}) {
  try {
    const response = await fetch(`${PYTHON_TRAINING_URL}${endpoint}`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      ...options,
    });

    if (!response.ok) {
      throw new Error(`Python training returned ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn("Python training service unavailable:", error);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id") || "";
  
  // Try Python training service
  const pythonJobs = await callPythonTraining("/api/training/jobs");
  if (pythonJobs && pythonJobs.jobs) {
    const jobs = Object.values(pythonJobs.jobs).map((j: any) => ({
      id: j.job_id,
      name: `Training ${j.params?.kind || "both"}`,
      status: j.status,
      progress: j.status === "completed" ? 100 : j.status === "running" ? 50 : 0,
      baseModel: "scratch-tinygpt",
      epochs: j.params?.epochs || 20,
      learningRate: j.params?.lr || 0.003,
      createdAt: new Date(j.started_at * 1000).toISOString(),
      completedAt: j.completed_at ? new Date(j.completed_at * 1000).toISOString() : undefined,
      kind: j.params?.kind,
      logs: j.logs,
    }));

    return NextResponse.json({
      jobs,
      models: [
        {
          id: registry.generator.name,
          name: "Ensemble Generator",
          params: registry.generator.params ?? 0,
          nLayer: registry.generator.n_layer ?? 0,
          nEmbd: registry.generator.n_embd ?? 0,
          blockSize: registry.generator.block_size ?? 0,
        },
        {
          id: registry.scorer.name,
          name: "Answer Scorer",
          params: registry.scorer.params ?? 0,
          nLayer: registry.scorer.n_layer ?? 0,
          nEmbd: registry.scorer.n_embd ?? 0,
          blockSize: registry.scorer.block_size ?? 0,
        },
      ],
      corpus: registry.corpus ?? { docs: 0, chars: 0 },
    });
  }

  // Fallback to mock
  const modelJobs = seedJobs();
  return NextResponse.json({
    jobs: modelJobs,
    models: [
      {
        id: registry.generator.name,
        name: "Ensemble Generator",
        params: registry.generator.params ?? 0,
        nLayer: registry.generator.n_layer ?? 0,
        nEmbd: registry.generator.n_embd ?? 0,
        blockSize: registry.generator.block_size ?? 0,
      },
      {
        id: registry.scorer.name,
        name: "Answer Scorer",
        params: registry.scorer.params ?? 0,
        nLayer: registry.scorer.n_layer ?? 0,
        nEmbd: registry.scorer.n_embd ?? 0,
        blockSize: registry.scorer.block_size ?? 0,
      },
    ],
    corpus: registry.corpus ?? { docs: 0, chars: 0 },
  });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // fall through
  }

  const userId = body.user_id;
  if (!userId) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  const kind = (body.kind as string) || "both";
  const epochs = Math.min(100, Math.max(1, Number(body.epochs) || 20));
  const batch_size = Math.min(64, Math.max(1, Number(body.batch_size) || 16));
  const lr = Number(body.learning_rate) || 0.003;
  const block_size = Number(body.block_size) || 512;
  const vocab_size = Number(body.vocab_size) || 4096;
  const n_layer = Number(body.n_layer) || 6;
  const n_head = Number(body.n_head) || 4;
  const n_embd = Number(body.n_embd) || 128;

  // Create training job in Supabase
  const supabase = createServerSupabaseClient();
  const { data: job, error } = await supabase
    .from("training_jobs")
    .insert({
      user_id: userId,
      status: "pending",
      kind,
      epochs,
      batch_size,
      n_layer,
      n_head,
      n_embd,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Try Python training service
  const pythonResult = await callPythonTraining("/api/training/start", {
    method: "POST",
    body: JSON.stringify({
      kind,
      epochs,
      batch_size,
      lr,
      block_size,
      vocab_size,
      n_layer,
      n_head,
      n_embd,
      cpu: true,
    }),
  });

  if (pythonResult && pythonResult.job_id) {
    // Update Supabase job with Python job ID
    await supabase
      .from("training_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", job.id);

    return NextResponse.json({
      job: {
        ...job,
        status: "running",
        started_at: new Date().toISOString(),
      },
      _source: "python-training",
    }, { status: 201 });
  }

  // Fallback to mock
  const mockJob: Job = {
    id: `job_${Date.now()}`,
    name: `Training ${kind}`,
    status: "pending",
    progress: 0,
    baseModel: "scratch-tinygpt",
    epochs,
    learningRate: lr,
    createdAt: new Date().toISOString(),
    kind,
  };
  seedJobs().unshift(mockJob);

  const interval = setInterval(() => {
    mockJob.progress = Math.min(100, mockJob.progress + 20);
    if (mockJob.progress >= 100) {
      mockJob.status = "completed";
      mockJob.completedAt = new Date().toISOString();
      mockJob.modelPath = kind.includes("generator") ? "/models/ensemble-generator" : "/models/ensemble-scorer";
      clearInterval(interval);
    }
  }, 800);

  return NextResponse.json({ job: mockJob }, { status: 201 });
}