import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { MultiLLM } from "@/lib/multi-llm";
import { getProfile, decrementCredits, getApiKeys } from "@/lib/supabase/services";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { getAuthenticatedUserId } from "@/lib/supabase/serverAuth";
import { checkRateLimit, getClientIp, type Tier } from "@/lib/rateLimiter";
import { decryptApiKey } from "@/lib/encryption";

/**
 * Loads the user's own BYO provider keys (if any), decrypted server-side
 * only, grouped by provider. Never logged -- returned only for a single
 * request's outbound call to the Python ensemble over the internal-secret
 * channel, never persisted or echoed back to the client.
 */
async function loadUserProviderKeys(userId: string): Promise<Record<string, string[]> | null> {
  const rows = await getApiKeys(userId);
  if (!rows.length) return null;

  const grouped: Record<string, string[]> = {};
  for (const row of rows) {
    try {
      const plaintext = await decryptApiKey(row.encrypted_key);
      grouped[row.provider] = [...(grouped[row.provider] || []), plaintext];
    } catch {
      // Skip a key that fails to decrypt (e.g. rotated ENCRYPTION_KEY)
      // rather than failing the whole query.
    }
  }
  return Object.keys(grouped).length ? grouped : null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const multiLLM = new MultiLLM();
const PYTHON_ENSEMBLE_URL = process.env.PYTHON_ENSEMBLE_URL || "http://localhost:8000";

async function callPythonEnsemble(prompt: string, options: any = {}, requestId?: string) {
  try {
    const response = await fetch(`${PYTHON_ENSEMBLE_URL}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
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
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
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

  const profile = userId ? await getProfile(userId) : null;

  const tier: Tier = (apiKeyAuth?.tier as Tier) || (profile?.plan as Tier) || "free";
  const identityKey = apiKeyAuth ? `key:${apiKeyAuth.keyId}` : userId ? `user:${userId}` : undefined;
  const rateLimit = checkRateLimit({ ip: getClientIp(req), identityKey, tier });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  if (profile && profile.credits <= 0) {
    return NextResponse.json(
      { error: "Out of credits. Upgrade your plan to continue." },
      { status: 402 }
    );
  }

  // BYO provider keys: if the user has connected their own (encrypted at
  // rest, decrypted only here, server-side, for this one request), run
  // their query against those instead of the platform's keys, falling back
  // to the platform's per-provider when they haven't connected one.
  const userProviderKeys = userId ? await loadUserProviderKeys(userId) : null;
  if (userProviderKeys) {
    options = { ...options, provider_keys: userProviderKeys };
  }

  // Policy: when the Python ensemble is unreachable, fail loudly (503) rather
  // than silently answering with lib/multi-llm.ts's canned demo text and
  // fake scores. Handing a paying user a fabricated "answer" that looks real
  // is worse than a clear, retryable error -- they'd have no way to tell the
  // difference. lib/multi-llm.ts is kept only for the GET health/model-list
  // fallback below, which doesn't fabricate a query result.
  const pythonResult = await callPythonEnsemble(prompt, options, requestId);
  if (!pythonResult) {
    return NextResponse.json(
      {
        error: "The ensemble backend is temporarily unavailable. Please try again shortly.",
        code: "ENSEMBLE_UNAVAILABLE",
        request_id: requestId,
      },
      { status: 503, headers: { "Retry-After": "30", "x-request-id": requestId } }
    );
  }

  const answer: string = pythonResult.answer;
  const metrics: any = {
    accuracy: pythonResult.metrics?.top_score || 0,
    latency_s: (pythonResult.metrics?.latency_ms || 0) / 1000,
    carbon_saved_g: pythonResult.metrics?.carbon_saved_g || 0,
    emissions_g: pythonResult.metrics?.emissions_g || 0,
    providers_used: pythonResult.providers_used || [],
  };
  const candidates: any[] = pythonResult.candidates || [];
  const sources: any[] = pythonResult.sources || [];
  const tokenSavings: Record<string, number> | null = pythonResult.token_savings || null;
  const refinedPrompt: string | null = pythonResult.refined_prompt || null;

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

  return NextResponse.json(
    {
      answer,
      metrics,
      _source: "python-ensemble",
      _candidates: candidates,
      _sources: sources,
      token_savings: tokenSavings,
      refined_prompt: refinedPrompt,
      request_id: requestId,
    },
    { headers: { "x-request-id": requestId } }
  );
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