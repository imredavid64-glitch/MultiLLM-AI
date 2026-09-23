import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getProfile, getSubscription, upsertSubscription } from "@/lib/supabase/services";
import { getAuthenticatedUserId } from "@/lib/supabase/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isBuildTime = !process.env.STRIPE_SECRET_KEY;

let _stripe: Stripe | null = null;
const getStripe = () => {
  if (isBuildTime) return null;
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return _stripe;
};

const PRICE_IDS: Record<"pro" | "enterprise", string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const plan = body?.plan as "pro" | "enterprise";

  if (!plan || !PRICE_IDS[plan]) {
    return NextResponse.json({ error: "Missing or invalid plan" }, { status: 400 });
  }

  const profile = await getProfile(userId);
  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let subscription = await getSubscription(userId);
  let customerId = subscription?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      metadata: { user_id: userId },
    });
    customerId = customer.id;

    // Create the row now so the webhook can find this user once the
    // subscription is created (it looks up subscriptions by customer id).
    subscription = await upsertSubscription({
      user_id: userId,
      stripe_customer_id: customerId,
      plan: "free",
      status: "active",
      credits_included: 100,
    });
  }

  const origin = req.headers.get("origin") || `https://${req.headers.get("host")}`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: PRICE_IDS[plan]!, quantity: 1 }],
    success_url: `${origin}/dashboard/billing?checkout=success`,
    cancel_url: `${origin}/dashboard/billing?checkout=canceled`,
    client_reference_id: userId,
  });

  return NextResponse.json({ url: session.url });
}
