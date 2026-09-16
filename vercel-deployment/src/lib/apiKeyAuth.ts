import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { getPlatformApiKeyByHash, touchPlatformApiKeyUsage } from "@/lib/supabase/services";

export const KEY_PREFIX_LENGTH = 16;

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface ApiKeyAuthResult {
  userId: string;
  keyId: string;
  tier: "free" | "pro" | "enterprise";
  recordUsage: () => Promise<void>;
}

/**
 * Authenticates a request carrying `Authorization: Bearer mllm_...`.
 * Returns null (not an error) when no bearer token is present, so callers can
 * fall back to session-based auth for the dashboard's own requests.
 */
export async function authenticateApiKey(req: NextRequest): Promise<ApiKeyAuthResult | null> {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(mllm_\S+)$/i);
  if (!match) return null;

  const rawKey = match[1];
  const keyHash = hashApiKey(rawKey);
  const record = await getPlatformApiKeyByHash(keyHash);
  if (!record) return null;

  return {
    userId: record.user_id,
    keyId: record.id,
    tier: record.tier,
    recordUsage: () => touchPlatformApiKeyUsage(record.id, record.usage_count),
  };
}
