import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { createServerSupabaseClient } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isBuildTime = !process.env.STRIPE_SECRET_KEY;

let _stripe: Stripe | null = null;
const getStripe = () => {
  if (isBuildTime) return null;
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return _stripe;
};

const PLAN_CREDITS = {
  free: 100,
  pro: 10000,
  enterprise: 100000,
};

// Stripe moved current_period_start/end off Stripe.Subscription and onto
// each Stripe.SubscriptionItem as of the API version this SDK (v22) defaults
// to -- reading it off the subscription itself is `undefined`, and
// `new Date(undefined * 1000)` throws RangeError: Invalid time value,
// crashing this handler on every real subscription.created/updated event.
function getCurrentPeriodEnd(subscription: Stripe.Subscription): string | null {
  const periodEnd = subscription.items.data[0]?.current_period_end;
  return periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const priceId = subscription.items.data[0]?.price?.id;

  const supabase = createServerSupabaseClient();

  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .single();

  if (error || !sub) {
    console.log(`No user found for customer ${customerId}`);
    return;
  }

  const plan = getPlanFromPriceId(priceId);
  const credits = PLAN_CREDITS[plan] || PLAN_CREDITS.free;

  const subUpdate = {
    stripe_subscription_id: subscriptionId,
    plan,
    status: subscription.status,
    current_period_end: getCurrentPeriodEnd(subscription),
    credits_included: credits,
    updated_at: new Date().toISOString(),
  };
  await supabase.from("subscriptions").update(subUpdate as any).eq("id", sub.id);

  await supabase.from("profiles").update({ plan, credits } as any).eq("id", sub.user_id);

  console.log(`Updated subscription for user ${sub.user_id} to ${plan}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const priceId = subscription.items.data[0]?.price?.id;

  const supabase = createServerSupabaseClient();

  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .single();

  if (error || !sub) return;

  const plan = getPlanFromPriceId(priceId);
  const credits = PLAN_CREDITS[plan] || PLAN_CREDITS.free;

  const subUpdate = {
    stripe_subscription_id: subscriptionId,
    plan,
    status: subscription.status,
    current_period_end: getCurrentPeriodEnd(subscription),
    credits_included: credits,
    updated_at: new Date().toISOString(),
  };
  await supabase.from("subscriptions").update(subUpdate as any).eq("id", sub.id);

  await supabase.from("profiles").update({ plan, credits } as any).eq("id", sub.user_id);

  console.log(`Updated subscription for user ${sub.user_id} to ${plan} (${subscription.status})`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const supabase = createServerSupabaseClient();

  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .single();

  if (error || !sub) return;

  await supabase.from("subscriptions").update({
    plan: "free",
    status: "canceled",
    credits_included: PLAN_CREDITS.free,
    updated_at: new Date().toISOString(),
  } as any).eq("id", sub.id);

  await supabase.from("profiles").update({ plan: "free", credits: PLAN_CREDITS.free } as any).eq("id", sub.user_id);

  console.log(`Downgraded user ${sub.user_id} to free`);
}

// Invoice.subscription was removed in favor of
// invoice.parent.subscription_details.subscription (which can come back
// as either a plain id or an expanded Subscription object) -- the old
// top-level field is always undefined on this API version, which made
// handleInvoicePaymentSucceeded's `if (!subscriptionId) return;` guard
// fire on every real invoice and silently skip the credit reset entirely.
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const subscriptionId = getInvoiceSubscriptionId(invoice);

  if (!subscriptionId) return;

  const supabase = createServerSupabaseClient();

  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .single();

  if (error || !sub) return;

  await supabase.from("profiles").update({ credits: sub.credits_included } as any).eq("id", sub.user_id);

  console.log(`Reset credits for user ${sub.user_id} on payment success`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const supabase = createServerSupabaseClient();

  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .single();

  if (error || !sub) return;

  await supabase.from("subscriptions").update({ status: "past_due", updated_at: new Date().toISOString() } as any).eq("id", sub.id);

  console.log(`Marked subscription past_due for user ${sub.user_id}`);
}

function getPlanFromPriceId(priceId: string | undefined): "free" | "pro" | "enterprise" {
  if (!priceId) return "free";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return "enterprise";
  return "free";
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = headers();
  const sig = headersList.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error(`Error processing webhook: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
