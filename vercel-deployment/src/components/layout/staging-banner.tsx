import { getAppEnv } from "@/lib/env";

// Rendered on every page (see layout.tsx) in anything other than production
// -- a fixed, unmissable bar so a staging/preview deploy can never be
// confused with the live app at a glance.
export default function StagingBanner() {
  const appEnv = getAppEnv();
  if (appEnv === "production") return null;

  const label = appEnv === "staging" ? "Staging" : "Development";

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500 text-amber-950 text-center text-xs font-semibold py-1 tracking-wide">
      {label} environment &mdash; not the live app
    </div>
  );
}
