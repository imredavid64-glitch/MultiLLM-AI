import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createPlatformApiKey,
  getPlatformApiKeys,
  getProfile,
} from "@/lib/supabase/services";
import { hashApiKey, KEY_PREFIX_LENGTH } from "@/lib/apiKeyAuth";
import { getAuthenticatedUserId } from "@/lib/supabase/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TIERS = ["free", "pro", "enterprise"] as const;
type Tier = (typeof VALID_TIERS)[number];
const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, enterprise: 2 };

function generatePlatformKey(tier: Tier): string {
  return `mllm_${tier}_${randomBytes(24).toString("hex")}`;
}

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const keys = await getPlatformApiKeys(userId);
  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      tier: k.tier,
      key_prefix: k.key_prefix,
      usage_count: k.usage_count,
      last_used_at: k.last_used_at,
      created_at: k.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const requestedTier: Tier = VALID_TIERS.includes(body?.tier) ? body.tier : "free";

  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  // The requested tier is a client-supplied value -- never trust it past the
  // caller's own actual plan. A free-plan account could otherwise mint an
  // "enterprise" key directly against this endpoint (bypassing the disabled
  // button in the UI) and get that tier's 1000 req/min instead of free's 10.
  const profile = await getProfile(userId);
  const planTier: Tier = (profile?.plan as Tier) || "free";
  if (TIER_RANK[requestedTier] > TIER_RANK[planTier]) {
    return NextResponse.json(
      { error: `Your plan (${planTier}) doesn't allow generating a ${requestedTier}-tier key. Upgrade to unlock it.` },
      { status: 403 }
    );
  }
  const tier = requestedTier;

  const plaintextKey = generatePlatformKey(tier);
  const keyHash = hashApiKey(plaintextKey);
  const keyPrefix = plaintextKey.slice(0, KEY_PREFIX_LENGTH);

  const created = await createPlatformApiKey(userId, name, tier, keyPrefix, keyHash);
  if (!created) {
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }

  // The plaintext key is returned exactly once and never stored.
  return NextResponse.json({
    id: created.id,
    name: created.name,
    tier: created.tier,
    key: plaintextKey,
    key_prefix: created.key_prefix,
    created_at: created.created_at,
  });
}
