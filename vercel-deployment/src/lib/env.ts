export type AppEnv = "production" | "staging" | "development";

// Read once per process -- APP_ENV is a plain (non-NEXT_PUBLIC_) var since
// this is only ever consulted from server components/route handlers, which
// render the result into markup (see StagingBanner) rather than needing it
// client-side directly.
//
// Unset or unrecognized defaults to "development", not "production" -- a
// staging/preview deploy where someone forgot to set APP_ENV should look
// obviously non-production (banner shown), never silently pass for the real
// thing.
export function getAppEnv(): AppEnv {
  const value = (process.env.APP_ENV || "").trim().toLowerCase();
  if (value === "production" || value === "staging") return value;
  return "development";
}

export function isProduction(): boolean {
  return getAppEnv() === "production";
}
