// Global daily cap on estimated provider spend, mirroring the pure-function
// style of src/lib/credits.ts (decideCreditReset): the decision logic here
// is dependency-free and unit-testable, while the actual "what did we spend
// today" read is a DB aggregate (see getTodayProviderSpendUsd in
// src/lib/supabase/services.ts), kept separate on purpose.

export interface SpendCapStatus {
  // Today's estimated spend has reached (or passed) the cap -- stop calling
  // paid providers.
  blocked: boolean;
  // Today's estimated spend has reached 80% of the cap but not the cap
  // itself -- still allowed, but worth a loud warning in the logs.
  warn: boolean;
  capUsd: number | null;
  todaySpendUsd: number;
}

const WARN_THRESHOLD_RATIO = 0.8;

/**
 * `capUsd` of `null` (or <= 0) means the cap is disabled -- every query is
 * allowed regardless of spend. Set DAILY_PROVIDER_SPEND_CAP_USD to enable it
 * (see getDailySpendCapUsd).
 */
export function evaluateSpendCap(todaySpendUsd: number, capUsd: number | null): SpendCapStatus {
  if (capUsd === null || capUsd <= 0) {
    return { blocked: false, warn: false, capUsd: null, todaySpendUsd };
  }
  const ratio = todaySpendUsd / capUsd;
  return {
    blocked: ratio >= 1,
    warn: ratio >= WARN_THRESHOLD_RATIO,
    capUsd,
    todaySpendUsd,
  };
}

export function getDailySpendCapUsd(): number | null {
  const raw = process.env.DAILY_PROVIDER_SPEND_CAP_USD;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
