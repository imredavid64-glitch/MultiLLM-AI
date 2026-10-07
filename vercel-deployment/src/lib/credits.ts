// Pure, dependency-free credit-period logic -- deliberately kept out of SQL
// so it's unit-testable (this repo's Vitest suite never hits a real
// database; a decision buried only in a Postgres function couldn't be
// exercised by a test at all). The atomic part that actually has to be
// race-safe -- the decrement itself -- lives in a single-statement SQL
// function instead (see supabase/schema.sql's decrement_credits_atomic and
// reset_credits_period). See src/lib/supabase/services.ts's consumeCredits()
// for how the two are combined.

export type PlanId = "free" | "pro" | "enterprise";

// The one place plan credit allowances are defined. src/lib/pricing.ts's
// tier data reads queriesPerMonth from here too, so the UI and the actual
// monthly reset can't drift apart.
export const PLAN_CREDIT_ALLOWANCES: Record<PlanId, number> = {
  free: 100,
  pro: 10000,
  enterprise: 100000,
};

// "more than one month ago" -- a fixed 30-day window, not calendar-month
// arithmetic (which has edge cases like Jan 31 + 1 month). Simple and
// predictable; revisit if billing ever needs calendar-month precision.
const RESET_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CreditResetDecision {
  shouldReset: boolean;
  newAllowance?: number;
}

/**
 * Decides whether a user's credit period should roll over to a fresh
 * monthly allowance. Demo/trial accounts (provisioned by
 * scripts/demo-account.mjs) always carry a non-null plan_expires_at and get
 * a fixed one-time budget -- they never refill, regardless of how long it's
 * been since their period started.
 */
export function decideCreditReset(params: {
  plan: PlanId;
  creditsPeriodStart: string;
  isDemoAccount: boolean;
  now?: Date;
}): CreditResetDecision {
  if (params.isDemoAccount) {
    return { shouldReset: false };
  }
  const now = params.now ?? new Date();
  const periodStartMs = new Date(params.creditsPeriodStart).getTime();
  if (now.getTime() - periodStartMs < RESET_INTERVAL_MS) {
    return { shouldReset: false };
  }
  return { shouldReset: true, newAllowance: PLAN_CREDIT_ALLOWANCES[params.plan] ?? PLAN_CREDIT_ALLOWANCES.free };
}
