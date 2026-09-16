import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createPlatformApiKey,
  getPlatformApiKeys,
} from "@/lib/supabase/services";
import { hashApiKey, KEY_PREFIX_LENGTH } from "@/lib/apiKeyAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TIERS = ["free", "pro", "enterprise"] as const;
type Tier = (typeof VALID_TIERS)[number];

function generatePlatformKey(tier: Tier): string {
  return `mllm_${tier}_${randomBytes(24).toString("hex")}`;
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id") || "";
  if (!userId) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
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
  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const tier: Tier = VALID_TIERS.includes(body?.tier) ? body.tier : "free";

  if (!userId || !name) {
    return NextResponse.json({ error: "Missing user_id or name" }, { status: 400 });
  }

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
