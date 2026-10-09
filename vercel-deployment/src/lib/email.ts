import { isProduction } from "@/lib/env";

// Thin wrapper around Resend's REST API (no SDK dependency, same style as
// this repo's existing raw-fetch calls to Upstash) so the provider can be
// swapped later without touching every call site -- only this function
// would need to change.
//
// Outside production, a missing RESEND_API_KEY logs the email instead of
// sending it (and failing loudly) -- staging/dev/preview environments
// shouldn't need a real Resend account just to exercise the lifecycle-email
// code paths. In production, a missing key throws: silently dropping a
// welcome/low-credits/plan-expiring email for a real user is worse than a
// loud failure that gets noticed and fixed.
export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
}

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (isProduction()) {
      throw new Error("RESEND_API_KEY and EMAIL_FROM must both be set to send email in production.");
    }
    console.log(`[email:would-send] to=${params.to} subject=${JSON.stringify(params.subject)}\n${params.text}`);
    return;
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: params.to, subject: params.subject, text: params.text }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend send failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}
