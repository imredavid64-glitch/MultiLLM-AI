// No fallback here on purpose -- next.config.js fails the production build
// outright if NEXT_PUBLIC_CONTACT_EMAIL is unset, rather than silently
// shipping a fake "sales@example.com" address on every billing/pricing CTA
// and the footer. Non-production builds (local dev, CI, preview) may still
// see this as an empty string if the var isn't set there.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";
