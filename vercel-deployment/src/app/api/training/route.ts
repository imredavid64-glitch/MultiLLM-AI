import { NextRequest, NextResponse } from "next/server";
import registry from "@/lib/model-registry.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
}

let jobs: Job[] = [];

function seedJobs(): Job[] {
  if (jobs.length > 0) return jobs;
  const now = new Date();
  jobs = [
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
    },
  ];
  return jobs;
}

export async function GET() {
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
  let body: Partial<Job> = {};
  try {
    body = await req.json();
  } catch {
    // fall through with empty body
  }

  const name = body.name?.trim() || "Untitled training job";
  const epochs = Math.min(50, Math.max(1, Number(body.epochs) || 3));
  const learningRate = Number(body.learningRate) || 0.003;

  const job: Job = {
    id: `job_${Date.now()}`,
    name,
    status: "pending",
    progress: 0,
    baseModel: "scratch-tinygpt",
    epochs,
    learningRate,
    createdAt: new Date().toISOString(),
  };
  seedJobs().unshift(job);

  // Simulate progress so the UI feels alive while waiting on a real queue.
  const interval = setInterval(() => {
    job.progress = Math.min(100, job.progress + 20);
    if (job.progress >= 100) {
      job.status = "completed";
      job.completedAt = new Date().toISOString();
      job.modelPath = "/models/ensemble-generator";
      clearInterval(interval);
    }
  }, 800);

  return NextResponse.json({ job }, { status: 201 });
}
