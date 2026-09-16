"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CreditCard, Calendar, ExternalLink, Crown, Zap, AlertCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import DashboardHeader from "@/components/layout/dashboard-header";
import { getSupabase } from "@/lib/supabase/client";

const SUBSCRIPTION_TIERS: Array<{ id: "free" | "pro" | "enterprise"; name: string; price: number; queriesPerMonth: number; rateLimit: number }> = [
  { id: "free", name: "Free", price: 0, queriesPerMonth: 100, rateLimit: 10 },
  { id: "pro", name: "Pro", price: 29, queriesPerMonth: 10000, rateLimit: 100 },
  { id: "enterprise", name: "Enterprise", price: 299, queriesPerMonth: -1, rateLimit: 1000 },
];

interface SubscriptionRow {
  plan: "free" | "pro" | "enterprise";
  status: "active" | "canceled" | "past_due" | "trialing";
  current_period_end: string | null;
  credits_included: number;
}

export default function BillingPage() {
  const { user, demoMode } = useAuth();
  const userId = user?.id || "";

  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || demoMode) {
      setLoading(false);
      return;
    }
    (async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .from("subscriptions")
        .select("plan, status, current_period_end, credits_included")
        .eq("user_id", userId)
        .single();
      setSubscription((data as SubscriptionRow) || null);
      setLoading(false);
    })();
  }, [userId, demoMode]);

  const formatDate = (date: string) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-emerald-100 text-emerald-700";
      case "past_due": return "bg-red-100 text-red-700";
      case "canceled": return "bg-slate-100 text-slate-700";
      case "trialing": return "bg-blue-100 text-blue-700";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  const handleUpgrade = async (tierId: "free" | "pro" | "enterprise") => {
    if (tierId === "free" || !userId) return;
    if (demoMode) {
      toast.error("Billing requires a real account (demo mode has no payment backend).");
      return;
    }
    setActionPending(tierId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, plan: tierId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err.message || "Could not start checkout");
      setActionPending(null);
    }
  };

  const handleManageBilling = async () => {
    if (!userId) return;
    if (demoMode) {
      toast.error("Billing requires a real account (demo mode has no payment backend).");
      return;
    }
    setActionPending("portal");
    try {
      const res = await fetch("/api/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not open billing portal");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err.message || "Could not open billing portal");
      setActionPending(null);
    }
  };

  const currentPlan = subscription?.plan || user?.profile?.plan || "free";
  const credits = user?.profile?.credits ?? 0;
  const planLimit = SUBSCRIPTION_TIERS.find((t) => t.id === currentPlan)?.queriesPerMonth ?? 100;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        <DashboardHeader />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between mb-8"
          >
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Billing & Subscription</h1>
              <p className="text-slate-600 mt-1">Manage your subscription, payment methods, and usage</p>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="lg:col-span-1"
            >
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
                  <Crown className="w-5 h-5 text-purple-600" />
                  Current Subscription
                </h2>

                {loading ? (
                  <div className="text-center py-8 text-slate-500">Loading...</div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Status</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(subscription?.status || "active")}`}>
                        {subscription?.status || "active"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Plan</span>
                      <span className="font-semibold text-slate-900 capitalize">{currentPlan}</span>
                    </div>

                    {subscription?.current_period_end && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Renews</span>
                        <span className="font-semibold text-slate-900">{formatDate(subscription.current_period_end)}</span>
                      </div>
                    )}

                    {currentPlan !== "free" && !demoMode && (
                      <button
                        onClick={handleManageBilling}
                        disabled={actionPending === "portal"}
                        className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {actionPending === "portal" ? "Opening..." : "Manage Billing / Cancel"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mt-6"
              >
                <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-purple-600" />
                  Usage This Month
                </h2>

                <div className="text-center py-4">
                  {planLimit === -1 ? (
                    <p className="text-slate-600">Unlimited queries on the Enterprise plan</p>
                  ) : (
                    <>
                      <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                      <p className="text-slate-600 mb-4">{planLimit.toLocaleString()} queries / month</p>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-purple-600 h-2 rounded-full"
                          style={{ width: `${Math.min((credits / planLimit) * 100, 100)}%` }}
                        />
                      </div>
                      <p className="text-sm text-slate-500 mt-2">
                        {credits.toLocaleString()} / {planLimit.toLocaleString()} credits remaining
                      </p>
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="lg:col-span-2"
            >
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
                <h2 className="text-xl font-semibold text-slate-900 mb-6">Choose Your Plan</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {SUBSCRIPTION_TIERS.map((tier) => (
                    <motion.div
                      key={tier.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.4 }}
                      className={`p-6 rounded-2xl border-2 transition-all relative ${
                        tier.id === currentPlan
                          ? "border-purple-500 bg-purple-50 shadow-lg"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {tier.id === currentPlan && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                          Current Plan
                        </div>
                      )}

                      <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-slate-900">{tier.name}</h3>
                        <div className="flex items-center justify-center gap-1 mt-2">
                          <span className="text-3xl font-bold text-slate-900">${tier.price}</span>
                          <span className="text-slate-500">/month</span>
                        </div>
                      </div>

                      <ul className="space-y-3 mb-6">
                        <li className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="w-5 h-5 text-purple-600">✓</span>
                          {tier.queriesPerMonth === -1 ? "Unlimited queries/month" : `${tier.queriesPerMonth.toLocaleString()} queries/month`}
                        </li>
                        <li className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="w-5 h-5 text-purple-600">✓</span>
                          {tier.rateLimit} requests/minute
                        </li>
                        <li className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="w-5 h-5 text-purple-600">✓</span>
                          Multiple models available
                        </li>
                      </ul>

                      {tier.id === currentPlan ? (
                        <button
                          className="w-full py-3 bg-slate-200 text-slate-600 rounded-xl font-semibold cursor-not-allowed"
                          disabled
                        >
                          Current Plan
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUpgrade(tier.id)}
                          disabled={actionPending === tier.id}
                          className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                        >
                          {actionPending === tier.id ? "Redirecting..." : tier.price === 0 ? "Downgrade" : "Upgrade"}
                        </button>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-600" />
                  Invoices & Payment Methods
                </h2>
                <p className="text-slate-600 mb-4">
                  Invoices, payment methods, and past charges are managed securely through Stripe.
                </p>
                {currentPlan !== "free" && !demoMode ? (
                  <button
                    onClick={handleManageBilling}
                    className="py-3 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors flex items-center gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    Open Billing Portal
                  </button>
                ) : (
                  <p className="text-sm text-slate-500">Upgrade to a paid plan to view invoices.</p>
                )}
              </div>
            </motion.div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
