"use client";

import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/contact";

interface Tier {
  id: "free" | "pro" | "enterprise";
  name: string;
  price: number;
  tagline: string;
  features: string[];
  highlighted?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    tagline: "Try the ensemble, no card required",
    features: ["100 queries / month", "10 requests/min rate limit", "All providers (BYO key optional)", "Query history & analytics"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    tagline: "For individuals shipping with it daily",
    features: ["10,000 queries / month", "100 requests/min rate limit", "Deep Review cross-checking", "Platform API keys", "Priority support"],
    highlighted: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 299,
    tagline: "For teams and agencies at scale",
    features: ["Unlimited queries", "1,000 requests/min rate limit", "Multi-tenant client projects", "Dedicated onboarding", "Custom contract & DPA"],
  },
];

const contactMailto = (subject: string) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

export default function PricingPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Simple, usage-based pricing</h1>
        <p className="text-slate-600 max-w-2xl mx-auto">
          Start free, no account needed. Upgrade when you need more volume or team features --
          every plan change goes to a real person, not a checkout form.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`bg-white rounded-2xl shadow-sm p-8 flex flex-col ${
              tier.highlighted ? "ring-2 ring-purple-600 shadow-lg" : "border border-slate-100"
            }`}
          >
            {tier.highlighted && (
              <span className="self-start mb-4 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                Most popular
              </span>
            )}
            <h2 className="text-xl font-semibold text-slate-900">{tier.name}</h2>
            <p className="text-sm text-slate-500 mt-1">{tier.tagline}</p>
            <div className="mt-6 mb-6">
              <span className="text-4xl font-bold text-slate-900">${tier.price}</span>
              <span className="text-slate-500">/month</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            {tier.id === "free" ? (
              <Link
                href="/#try-it"
                className="text-center px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-xl font-semibold transition-colors"
              >
                Try it free
              </Link>
            ) : (
              <a
                href={contactMailto(`MultiLLM ${tier.name} plan`)}
                className={`text-center px-4 py-3 rounded-xl font-semibold transition-colors inline-flex items-center justify-center gap-2 ${
                  tier.highlighted
                    ? "bg-purple-600 hover:bg-purple-700 text-white"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-900"
                }`}
              >
                Talk to us <ArrowRight className="w-4 h-4" />
              </a>
            )}
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-slate-500 mt-12">
        Already have an account?{" "}
        <Link href="/dashboard/billing" className="text-purple-600 underline">
          Manage your subscription
        </Link>{" "}
        from the dashboard.
      </p>
    </div>
  );
}
