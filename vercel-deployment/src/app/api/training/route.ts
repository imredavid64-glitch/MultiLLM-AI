import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/serverAuth";
import { createTrainingJob, getTrainingJobs, updateTrainingJob } from "@/lib/supabase/services";
import registry from "@/lib/model-registry.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PYTHON_TRAINING_URL = process.env.PYTHON_TRAINING_URL || "http://localhost:8001";

async function callPythonTraining(endpoint: string, options: RequestInit = {}) {
  try {
    const response = await fetch(`${PYTHON_TRAINING_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
      },
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

// Statuses in the `training_jobs` table are the only source of truth --
// nothing here fabricates progress. "running" is shown as a mid-way bar
// since real per-step progress isn't reported back by the training service;
// a job only reaches "completed"/"failed" once something actually updates
// its row. NOTE: functions/training-job/main.py does not currently write
// job completion back to Supabase, so today a job can stay "running"
// indefinitely once started -- closing that loop is separate follow-up work.
function progressForStatus(status: string): number {
  if (status === "completed") return 100;
  if (status === "running") return 50;
  return 0;
}

const registryModels = [
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
];

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Real rows only, scoped to this user via getTrainingJobs' own filter --
  // never a shared in-memory list and never fabricated placeholder jobs.
  const rows = await getTrainingJobs(userId);
  const jobs = rows.map((row) => ({
    id: row.id,
    name: `Training ${row.kind}`,
    status: row.status,
    progress: progressForStatus(row.status),
    baseModel: "scratch-tinygpt",
    epochs: row.epochs,
    learningRate: row.learning_rate,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    modelPath: row.model_path ?? undefined,
    kind: row.kind,
    logs: row.logs ?? undefined,
  }));

  return NextResponse.json({
    jobs,
    models: registryModels,
    corpus: registry.corpus ?? { docs: 0, chars: 0 },
  });
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // fall through
  }

  const requestedKind = body.kind as string;
  const kind: "generator" | "scorer" | "both" =
    requestedKind === "generator" || requestedKind === "scorer" ? requestedKind : "both";
  const epochs = Math.min(100, Math.max(1, Number(body.epochs) || 20));
  const batch_size = Math.min(64, Math.max(1, Number(body.batch_size) || 16));
  const lr = Number(body.learning_rate) || 0.003;
  const block_size = Number(body.block_size) || 512;
  const vocab_size = Number(body.vocab_size) || 4096;
  const n_layer = Number(body.n_layer) || 6;
  const n_head = Number(body.n_head) || 4;
  const n_embd = Number(body.n_embd) || 128;

  const job = await createTrainingJob({
    user_id: userId,
    status: "pending",
    kind,
    epochs,
    batch_size,
    n_layer,
    n_head,
    n_embd,
    learning_rate: lr,
  });

  if (!job) {
    return NextResponse.json({ error: "Failed to create training job" }, { status: 500 });
  }

  // Kick off the actual training run. If the Python training service isn't
  // reachable, the job stays "pending" (an honest state) rather than being
  // faked as running/completed -- it'll need the service to be up (or a
  // manual retry) before it progresses.
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
      // Lets the training service write real completion status back to
      // this exact row once the run finishes, instead of it staying
      // "running" forever (see functions/training-job/main.py).
      supabase_job_id: job.id,
    }),
  });

  if (pythonResult?.job_id) {
    const updated = await updateTrainingJob(job.id, { status: "running", started_at: new Date().toISOString() });
    return NextResponse.json({ job: updated ?? job, _source: "python-training" }, { status: 201 });
  }

  return NextResponse.json({ job }, { status: 201 });
}
