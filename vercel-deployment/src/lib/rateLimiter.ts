/**
 * Simple in-memory, per-process rate limiter. Deliberately not distributed
 * (no Redis) -- on a serverless deployment with multiple warm instances this
 * only bounds *each* instance, not the account globally. It's a real, cheap
 * first line of defense, not a hard guarantee; upgrade to a shared store
 * (e.g. Upstash Redis) if that gap ever matters in practice.
 *
 * Tier limits mirror SUBSCRIPTION_TIERS in
 * src/app/dashboard/page.tsx (free/pro/enterprise: 10/100/1000 req/min).
 * Keep both in sync if the pricing tiers change.
 */

export type Tier = "free" | "pro" | "enterprise";

const WINDOW_MS = 60_000;

export const RATE_LIMITS: Record<Tier, number> = {
  free: 10,
  pro: 100,
  enterprise: 1000,
};

interface Bucket {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, Bucket>();
const identityBuckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

function checkBucket(store: Map<string, Bucket>, key: string, limit: number): RateLimitResult {
  const now = Date.now();
  const bucket = store.get(key);
  if (!bucket || now >= bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Anonymous callers (no session, no API key) are limited by IP alone at the
 * free tier's rate -- the strictest tier, since we can't verify who they are.
 * Identified callers are limited by their own tier, keyed by identity (a
 * generous-tier user on a shared IP -- an office, a VPN -- shouldn't starve
 * someone else on that IP), with a coarse per-IP ceiling at the top tier's
 * rate as a blunt guard against one IP spinning up many free accounts.
 */
export function checkRateLimit(opts: { ip: string; identityKey?: string; tier: Tier }): RateLimitResult {
  if (!opts.identityKey) {
    return checkBucket(ipBuckets, opts.ip, RATE_LIMITS.free);
  }
  const ipResult = checkBucket(ipBuckets, opts.ip, RATE_LIMITS.enterprise);
  if (!ipResult.allowed) return ipResult;
  const tierLimit = RATE_LIMITS[opts.tier] ?? RATE_LIMITS.free;
  return checkBucket(identityBuckets, opts.identityKey, tierLimit);
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
