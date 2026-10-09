import { sendEmail } from "@/lib/email";
import { welcomeEmail, lowCreditsEmail, planExpiringEmail } from "@/lib/emailTemplates";
import { tryClaimLifecycleEmail } from "@/lib/supabase/services";
import { PLAN_CREDIT_ALLOWANCES, type PlanId } from "@/lib/credits";

interface ProfileLike {
  id: string;
  email: string;
  name: string | null;
  plan: PlanId;
  credits: number;
  credits_period_start: string;
  plan_expires_at: string | null;
}

// Low-credits threshold: below 10% of the plan's monthly allowance.
const LOW_CREDITS_RATIO = 0.1;

export async function sendWelcomeEmailOnce(profile: ProfileLike): Promise<void> {
  const claimed = await tryClaimLifecycleEmail(profile.id, "welcome", "once");
  if (!claimed) return;
  const { subject, text } = welcomeEmail({ name: profile.name });
  await sendEmail({ to: profile.email, subject, text });
}

/**
 * Call after a credit consumption succeeds -- no-ops unless the remaining
 * balance just dropped below 10% of the plan's allowance. Scoped to the
 * current credits_period_start so it can fire again next period rather than
 * being a one-time-ever email.
 */
export async function maybeSendLowCreditsEmail(profile: ProfileLike, remainingCredits: number): Promise<void> {
  const allowance = PLAN_CREDIT_ALLOWANCES[profile.plan] ?? PLAN_CREDIT_ALLOWANCES.free;
  if (remainingCredits >= allowance * LOW_CREDITS_RATIO) return;

  const claimed = await tryClaimLifecycleEmail(profile.id, "low_credits", profile.credits_period_start);
  if (!claimed) return;
  const { subject, text } = lowCreditsEmail({ name: profile.name, creditsRemaining: remainingCredits, plan: profile.plan });
  await sendEmail({ to: profile.email, subject, text });
}

export async function maybeSendPlanExpiringEmail(profile: ProfileLike): Promise<void> {
  if (!profile.plan_expires_at) return;

  const claimed = await tryClaimLifecycleEmail(profile.id, "plan_expiring", profile.plan_expires_at);
  if (!claimed) return;
  const { subject, text } = planExpiringEmail({ name: profile.name, planExpiresAt: profile.plan_expires_at });
  await sendEmail({ to: profile.email, subject, text });
}
