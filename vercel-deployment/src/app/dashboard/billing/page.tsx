"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CreditCard, Calendar, Download, ArrowRight, Check, Crown, Zap, Users, Shield, AlertCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SUBSCRIPTION_TIERS, SubscriptionTier } from "@/lib/appwrite/types";

const mockSubscription = {
  id: "sub_123456",
  tier: "pro" as const,
  status: "active" as const,
  currentPeriodEnd: "2024-04-15T00:00:00Z",
  cancelAtPeriodEnd: false,
  paymentMethod: "**** **** **** 4567",
  nextBilling: "2024-02-15T00:00:00Z",
};

const mockInvoices = [
  {
    id: "inv_001",
    date: "2024-01-15T00:00:00Z",
    amount: 29.00,
    status: "paid" as const,
    period: "Jan 2024",
  },
  {
    id: "inv_002",
    date: "2023-12-15T00:00:00Z",
    amount: 29.00,
    status: "paid" as const,
    period: "Dec 2023",
  },
  {
    id: "inv_003",
    date: "2023-11-15T00:00:00Z",
    amount: 29.00,
    status: "paid" as const,
    period: "Nov 2023",
  },
];

const mockUsage = [
  { month: "Jan", queries: 2847, limit: 10000, percentage: 28.5 },
  { month: "Feb", queries: 9500, limit: 10000, percentage: 95 },
  { month: "Mar", queries: 8200, limit: 10000, percentage: 82 },
  { month: "Apr", queries: 7500, limit: 10000, percentage: 75 },
  { month: "May", queries: 6800, limit: 10000, percentage: 68 },
  { month: "Jun", queries: 7100, limit: 10000, percentage: 71 },
];

export default function BillingPage() {
  const { user } = useAuth();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

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

  const handleUpgrade = (tierId: string) => {
    console.log("Upgrading to tier:", tierId);
    // In a real app, this would redirect to a payment gateway
    toast.success("Redirecting to payment...");
  };

  const handleCancel = () => {
    console.log("Canceling subscription. Reason:", cancelReason);
    setShowCancelModal(false);
    toast.success("Subscription will be canceled at the end of the billing period");
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-white shadow-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-8">
                <a href="/dashboard" className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-purple-600">MultiLLM</span>
                </a>
                <nav className="hidden md:flex items-center gap-6">
                  <a href="/dashboard" className="text-slate-700 hover:text-purple-600 font-medium">Dashboard</a>
                  <a href="/dashboard/api-keys" className="text-slate-700 hover:text-purple-600 font-medium">API Keys</a>
                  <a href="/dashboard/training" className="text-slate-700 hover:text-purple-600 font-medium">Training</a>
                  <a href="/dashboard/analytics" className="text-slate-700 hover:text-purple-600 font-medium">Analytics</a>
                  <a href="/dashboard/settings" className="text-slate-700 hover:text-purple-600 font-medium">Settings</a>
                  <a href="/dashboard/billing" className="text-purple-600 font-medium">Billing</a>
                </nav>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-600">{user?.prefs?.subscriptionTier || "Free"}</span>
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-medium">
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
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
            {/* Current Subscription */}
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

                {mockSubscription ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Status</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(mockSubscription.status)}`}>{mockSubscription.status}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Tier</span>
                      <span className="font-semibold text-slate-900 capitalize">{mockSubscription.tier}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Next Billing</span>
                      <span className="font-semibold text-slate-900">{formatDate(mockSubscription.nextBilling)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Payment Method</span>
                      <span className="font-semibold text-slate-900">{mockSubscription.paymentMethod}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Renews</span>
                      <span className="font-semibold text-slate-900">{mockSubscription.cancelAtPeriodEnd ? "On next period" : "Automatically"}</span>
                    </div>

                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-semibold transition-colors"
                    >
                      Cancel Subscription
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CreditCard className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-slate-900 mb-2">No Active Subscription</h3>
                    <p className="text-slate-500 mb-6">Upgrade to Pro or Enterprise to unlock full features</p>
                    <button
                      onClick={() => handleUpgrade("pro")}
                      className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors"
                    >
                      Upgrade to Pro - $29/month
                    </button>
                  </div>
                )}
              </div>

              {/* Usage Summary */}
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

                {user?.prefs?.subscriptionTier === "free" ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Free Tier Limits</h3>
                    <p className="text-slate-600 mb-4">100 queries / month</p>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-yellow-500 h-2 rounded-full"
                        style={{ width: `${(user?.prefs?.monthlyQueries || 0) / 100 * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-slate-500 mt-2">
                      {user?.prefs?.monthlyQueries || 0} / {user?.prefs?.subscriptionTier === "free" ? "100" : "10,000"} queries used
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Used This Month</span>
                      <span className="font-semibold text-slate-900">{user?.prefs?.monthlyQueries || 0}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full"
                        style={{ width: `${Math.min(((user?.prefs?.monthlyQueries || 0) / 10000) * 100, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Limit</span>
                      <span className="font-semibold text-slate-900">10,000 queries</span>
                    </div>
                  </div>
                )}

                <button
                  className="w-full mt-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Usage Report
                </button>
              </motion.div>
            </motion.div>

            {/* Subscription Plans & Invoices */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="lg:col-span-2"
            >
              {/* Subscription Plans */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
                <h2 className="text-xl font-semibold text-slate-900 mb-6">Choose Your Plan</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {SUBSCRIPTION_TIERS.map((tier) => (
                    <motion.div
                      key={tier.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.4 }}
                      className={`p-6 rounded-2xl border-2 transition-all ${
                        tier.id === user?.prefs?.subscriptionTier
                          ? "border-purple-500 bg-purple-50 shadow-lg"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {tier.id === user?.prefs?.subscriptionTier && (
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
                          {tier.models.length} models available
                        </li>
                      </ul>

                      {tier.id === user?.prefs?.subscriptionTier ? (
                        <button
                          className="w-full py-3 bg-slate-200 text-slate-600 rounded-xl font-semibold cursor-not-allowed"
                          disabled
                        >
                          Current Plan
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUpgrade(tier.id)}
                          className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors"
                        >
                          {tier.price === 0 ? "Start Free" : "Upgrade"}
                        </button>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Recent Invoices */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-600" />
                  Recent Invoices
                </h2>

                <div className="divide-y divide-slate-100">
                  {mockInvoices.map((invoice) => (
                    <div key={invoice.id} className="py-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${invoice.status === "paid" ? "bg-emerald-100" : "bg-slate-100"}`}>
                          <Calendar className={`w-4 h-4 ${invoice.status === "paid" ? "text-emerald-600" : "text-slate-600"}`} />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">Invoice {invoice.id}</div>
                          <div className="text-sm text-slate-500">{invoice.period}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-semibold text-slate-900">${invoice.amount.toFixed(2)}</div>
                          <div className="text-sm text-slate-500">{formatDate(invoice.date)}</div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>{invoice.status}</span>
                        <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button className="w-full mt-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" />
                  Download All Invoices
                </button>
              </div>
            </motion.div>
          </div>
        </main>

        {/* Cancel Subscription Modal */}
        {showCancelModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCancelModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Cancel Subscription</h2>
              <p className="text-slate-600 mb-6">Are you sure? You'll lose access to all Pro features at the end of your billing period.</p>

              <div className="mb-6">
                <label htmlFor="cancelReason" className="block text-sm font-medium text-slate-700 mb-2">
                  Reason for cancellation (optional)
                </label>
                <textarea
                  id="cancelReason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Help us improve by telling us why you're leaving..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all h-24 resize-none"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-xl mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Current plan:</span>
                  <span className="font-semibold text-slate-900 capitalize">{mockSubscription?.tier}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-slate-600">Next billing:</span>
                  <span className="font-semibold text-slate-900">{mockSubscription?.nextBilling ? formatDate(mockSubscription.nextBilling) : "N/A"}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-slate-600">Access until:</span>
                  <span className="font-semibold text-slate-900">{mockSubscription?.currentPeriodEnd ? formatDate(mockSubscription.currentPeriodEnd) : "N/A"}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
                >
                  Keep Subscription
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors"
                >
                  Cancel Subscription
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </ProtectedRoute>
  );
}