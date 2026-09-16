import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSubscription } from "@/lib/supabase/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isBuildTime = !process.env.STRIPE_SECRET_KEY;

let _stripe: Stripe | null = null;
const getStripe = () => {
  if (isBuildTime) return null;
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return _stripe;
};

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  if (!userId) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  const subscription = await getSubscription(userId);
  if (!subscription?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account found for this user" }, { status: 404 });
  }

  const origin = req.headers.get("origin") || `https://${req.headers.get("host")}`;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${origin}/dashboard/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
