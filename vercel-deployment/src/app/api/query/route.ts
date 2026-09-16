import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { MultiLLM } from "@/lib/multi-llm";
import { getProfile, decrementCredits } from "@/lib/supabase/services";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { getAuthenticatedUserId } from "@/lib/supabase/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const multiLLM = new MultiLLM();
const PYTHON_ENSEMBLE_URL = process.env.PYTHON_ENSEMBLE_URL || "http://localhost:8000";

async function callPythonEnsemble(prompt: string, options: any = {}) {
  try {
    const response = await fetch(`${PYTHON_ENSEMBLE_URL}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, ...options }),
      signal: AbortSignal.timeout(55000),
    });

    if (!response.ok) {
      throw new Error(`Python ensemble returned ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn("Python ensemble unavailable, falling back to mock:", error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  let prompt = "";
  let options = {};

  // Programmatic access via a generated API key takes precedence over the
  // dashboard's own logged-in session. Neither is ever taken from the
  // request body -- that would let a caller claim any user_id they like.
  const apiKeyAuth = await authenticateApiKey(req);
  const sessionUserId = apiKeyAuth ? null : await getAuthenticatedUserId();
  const userId = apiKeyAuth?.userId || sessionUserId || "";

  try {
    const body = await req.json();
    prompt = typeof body?.prompt === "string" ? body.prompt : "";
    options = {
      bot_count: body?.bot_count,
      top_k: body?.top_k,
      privacy_redaction: body?.privacy_redaction,
    };
  } catch {
    // fall through
  }

  if (!prompt.trim()) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  if (userId) {
    const profile = await getProfile(userId);
    if (profile && profile.credits <= 0) {
      return NextResponse.json(
        { error: "Out of credits. Upgrade your plan to continue." },
        { status: 402 }
      );
    }
  }

  // Try Python ensemble first
  const pythonResult = await callPythonEnsemble(prompt, options);
  
  let answer: string;
  let metrics: any;
  let candidates: any[] = [];
  let sources: any[] = [];
  let tokenSavings: Record<string, number> | null = null;
  let refinedPrompt: string | null = null;

  if (pythonResult) {
    answer = pythonResult.answer;
    metrics = {
      accuracy: pythonResult.metrics?.top_score || 0,
      latency_s: 0,
      carbon_saved_g: 0.42,
      emissions_g: 0.013,
    };
    candidates = pythonResult.candidates || [];
    sources = pythonResult.sources || [];
    tokenSavings = pythonResult.token_savings || null;
    refinedPrompt = pythonResult.refined_prompt || null;
  } else {
    // Fallback to mock
    const result = await multiLLM.query(prompt);
    answer = result.answer;
    metrics = result.metrics;
  }

  // Save query history if userId provided
  if (userId) {
    const supabase = createServerSupabaseClient();
    const queryRecord = {
      user_id: userId,
      prompt,
      answer,
      top_provider: candidates[0]?.provider_name || "MultiLLM",
      top_model: candidates[0]?.model || "ensemble",
      confidence_score: metrics.accuracy,
      latency_ms: metrics.latency_s * 1000,
      carbon_saved: metrics.carbon_saved_g,
      emissions: metrics.emissions_g,
      candidates,
      sources,
    };
    await supabase.from("queries").insert(queryRecord as any);
    await decrementCredits(userId, 1);
  }

  if (apiKeyAuth) {
    await apiKeyAuth.recordUsage();
  }

  return NextResponse.json({
    answer,
    metrics,
    _source: pythonResult ? "python-ensemble" : "mock",
    _candidates: candidates,
    _sources: sources,
    token_savings: tokenSavings,
    refined_prompt: refinedPrompt,
  });
}

export async function GET() {
  // Try Python ensemble health check
  try {
    const response = await fetch(`${PYTHON_ENSEMBLE_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const health = await response.json();
      return NextResponse.json({
        models: health.provider_status?.split("\n").filter(Boolean).map((l: string) => l.trim()) || [],
        _source: "python-ensemble",
        _health: health,
      });
    }
  } catch {
    // fall through
  }

  return NextResponse.json({ models: multiLLM.getStats().models, _source: "mock" });
}