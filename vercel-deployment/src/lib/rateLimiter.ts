/**
 * Rate limiter with two backends:
 *  - Upstash Redis (REST API) when UPSTASH_REDIS_REST_URL/TOKEN are set --
 *    shared across every serverless instance, survives cold starts.
 *  - An in-memory, per-process Map otherwise (the original behavior) -- a
 *    real, cheap first line of defense, but only bounds *each* instance, not
 *    the account globally.
 *
 * Neither backend is a hard guarantee against abuse on its own; Redis being
 * unreachable fails OPEN (the request is allowed) rather than blocking every
 * request in the whole app on a rate-limiter outage.
 *
 * Tier limits mirror SUBSCRIPTION_TIERS in
 * src/app/dashboard/page.tsx (free/pro/enterprise: 10/100/1000 req/min).
 * Keep both in sync if the pricing tiers change.
 */

export type Tier = "free" | "pro" | "enterprise";

const WINDOW_MS = 60_000;
const WINDOW_SECONDS = Math.ceil(WINDOW_MS / 1000);

export const RATE_LIMITS: Record<Tier, number> = {
  free: 10,
  pro: 100,
  enterprise: 1000,
};

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

// ---- In-memory backend (default) ----

interface Bucket {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, Bucket>();
const identityBuckets = new Map<string, Bucket>();

function checkBucketMemory(store: Map<string, Bucket>, key: string, limit: number): RateLimitResult {
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

// ---- Upstash Redis backend (optional) ----

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_REDIS = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

async function upstashCommand(...args: (string | number)[]): Promise<any> {
  const path = args.map((a) => encodeURIComponent(String(a))).join("/");
  const res = await fetch(`${UPSTASH_URL}/${path}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash command failed: ${res.status}`);
  const data = await res.json();
  return data.result;
}

async function checkBucketRedis(namespace: string, key: string, limit: number): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${namespace}:${key}`;
  try {
    const count = await upstashCommand("INCR", redisKey);
    if (count === 1) {
      // Only the request that created the key sets its TTL, so later hits
      // in the same window don't keep pushing the reset time out.
      await upstashCommand("EXPIRE", redisKey, WINDOW_SECONDS);
    }
    if (count > limit) {
      const ttl = await upstashCommand("TTL", redisKey);
      return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    console.warn("Redis rate limiter unavailable, failing open:", err);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

async function checkBucket(namespace: "ip" | "identity", key: string, limit: number): Promise<RateLimitResult> {
  if (USE_REDIS) return checkBucketRedis(namespace, key, limit);
  return checkBucketMemory(namespace === "ip" ? ipBuckets : identityBuckets, key, limit);
}

/**
 * Anonymous callers (no session, no API key) are limited by IP alone at the
 * free tier's rate -- the strictest tier, since we can't verify who they are.
 * Identified callers are limited by their own tier, keyed by identity (a
 * generous-tier user on a shared IP -- an office, a VPN -- shouldn't starve
 * someone else on that IP), with a coarse per-IP ceiling at the top tier's
 * rate as a blunt guard against one IP spinning up many free accounts.
 */
export async function checkRateLimit(opts: { ip: string; identityKey?: string; tier: Tier }): Promise<RateLimitResult> {
  if (!opts.identityKey) {
    return checkBucket("ip", opts.ip, RATE_LIMITS.free);
  }
  const ipResult = await checkBucket("ip", opts.ip, RATE_LIMITS.enterprise);
  if (!ipResult.allowed) return ipResult;
  const tierLimit = RATE_LIMITS[opts.tier] ?? RATE_LIMITS.free;
  return checkBucket("identity", opts.identityKey, tierLimit);
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
