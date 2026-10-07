import { PLAN_CREDIT_ALLOWANCES, type PlanId } from "./credits";
import { RATE_LIMITS } from "./rateLimiter";

// Single source of truth for plan pricing/feature display -- previously
// duplicated (with "Unlimited queries" for enterprise and a hardcoded "$")
// across src/app/pricing/page.tsx, src/app/dashboard/billing/page.tsx, and
// src/app/dashboard/page.tsx. queriesPerMonth and rateLimit are read from
// src/lib/credits.ts and src/lib/rateLimiter.ts respectively, rather than
// re-stated here, so the UI can't drift from what's actually enforced.

// TODO(david): placeholder amounts carried over from the pre-existing USD
// figures ($29 / $299) -- replace with real EUR pricing once confirmed.
export const CURRENCY = "EUR";

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export interface Tier {
  id: PlanId;
  name: string;
  price: number;
  tagline: string;
  queriesPerMonth: number;
  rateLimit: number;
  features: string[];
  highlighted?: boolean;
}

function queriesPerMonthLabel(id: PlanId): string {
  const n = PLAN_CREDIT_ALLOWANCES[id].toLocaleString();
  return id === "enterprise" ? `${n} queries / month (higher on request)` : `${n} queries / month`;
}

export const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    tagline: "Try the ensemble, no card required",
    queriesPerMonth: PLAN_CREDIT_ALLOWANCES.free,
    rateLimit: RATE_LIMITS.free,
    features: [queriesPerMonthLabel("free"), `${RATE_LIMITS.free} requests/min rate limit`, "All providers (BYO key optional)", "Query history & analytics"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    tagline: "For individuals shipping with it daily",
    queriesPerMonth: PLAN_CREDIT_ALLOWANCES.pro,
    rateLimit: RATE_LIMITS.pro,
    features: [queriesPerMonthLabel("pro"), `${RATE_LIMITS.pro} requests/min rate limit`, "Deep Review cross-checking", "Platform API keys", "Priority support"],
    highlighted: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 299,
    tagline: "For teams and agencies at scale",
    queriesPerMonth: PLAN_CREDIT_ALLOWANCES.enterprise,
    rateLimit: RATE_LIMITS.enterprise,
    features: [queriesPerMonthLabel("enterprise"), `${RATE_LIMITS.enterprise} requests/min rate limit`, "Multi-tenant client projects", "Dedicated onboarding", "Custom contract & DPA"],
  },
];
