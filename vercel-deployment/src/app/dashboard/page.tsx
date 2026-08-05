"use client";

import { motion } from "framer-motion";
import { Zap, BarChart2, Key, Brain, ArrowRight, Users, Shield, Download, Clock } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SUBSCRIPTION_TIERS } from "@/lib/appwrite/types";

const stats = [
  { label: "Queries This Month", value: "2,847", change: "+12%", icon: Zap, color: "text-purple-600", bg: "bg-purple-100" },
  { label: "Avg Latency", value: "1.2s", change: "-0.3s", icon: Clock, color: "text-blue-600", bg: "bg-blue-100" },
  { label: "CO₂ Saved", value: "342g", change: "+45g", icon: Shield, color: "text-emerald-600", bg: "bg-emerald-100" },
  { label: "Ensemble Accuracy", value: "94.2%", change: "+1.1%", icon: BarChart2, color: "text-orange-600", bg: "bg-orange-100" },
];

const quickActions = [
  { label: "New Ensemble Query", href: "/", icon: Zap, color: "bg-purple-600 hover:bg-purple-700" },
  { label: "Generate API Key", href: "/dashboard/api-keys", icon: Key, color: "bg-blue-600 hover:bg-blue-700" },
  { label: "Train Custom Model", href: "/dashboard/training", icon: Brain, color: "bg-emerald-600 hover:bg-emerald-700" },
  { label: "View Analytics", href: "/dashboard/analytics", icon: BarChart2, color: "bg-orange-600 hover:bg-orange-700" },
];

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-white shadow-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-8">
                <Link href="/dashboard" className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-purple-600">MultiLLM</span>
                </Link>
                <nav className="hidden md:flex items-center gap-6">
                  <Link href="/dashboard" className="text-slate-700 hover:text-purple-600 font-medium">Dashboard</Link>
                  <Link href="/dashboard/api-keys" className="text-slate-700 hover:text-purple-600 font-medium">API Keys</Link>
                  <Link href="/dashboard/training" className="text-slate-700 hover:text-purple-600 font-medium">Training</Link>
                  <Link href="/dashboard/analytics" className="text-slate-700 hover:text-purple-600 font-medium">Analytics</Link>
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
          {/* Welcome Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-8 text-white">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <h1 className="text-3xl font-bold mb-2">Welcome back, {user?.name || "Developer"}</h1>
                  <p className="text-purple-100 text-lg">
                    Your Multi-LLM ensemble is ready. What will you ask today?
                  </p>
                </div>
                <Link
                  href="/"
                  className="bg-white text-purple-600 hover:bg-purple-50 px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2"
                >
                  <Zap className="w-5 h-5" />
                  Run Ensemble Query
                </Link>
              </div>
            </div>
          </motion.section>

          {/* Stats Grid */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                  className="bg-white rounded-xl shadow-sm p-6 border border-slate-100"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`${stat.bg} p-3 rounded-xl`}>
                      <stat.icon className={`w-6 h-6 ${stat.color}`} />
                    </div>
                    <span className="text-sm font-medium text-emerald-600">{stat.change}</span>
                  </div>
                  <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                  <p className="text-sm text-slate-500 mt-1">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Quick Actions */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-8"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickActions.map((action, index) => (
                <motion.a
                  key={action.label}
                  href={action.href}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  className="bg-white rounded-xl shadow-sm p-6 border border-slate-100 hover:shadow-md transition-all flex items-center gap-4"
                >
                  <div className={`${action.color} p-3 rounded-xl text-white`}>
                    <action.icon className="w-6 h-6" />
                  </div>
                  <span className="font-medium text-slate-900">{action.label}</span>
                </motion.a>
              ))}
            </div>
          </motion.section>

          {/* Subscription Tier */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Your Plan</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {SUBSCRIPTION_TIERS.map((tier) => (
                <motion.div
                  key={tier.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className={`relative rounded-2xl p-6 border-2 transition-all ${
                    tier.id === user?.prefs?.subscriptionTier
                      ? "border-purple-500 bg-purple-50 shadow-lg shadow-purple-100"
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
                      <span className="text-4xl font-bold text-slate-900">${tier.price}</span>
                      <span className="text-slate-500 mt-4">/month</span>
                    </div>
                  </div>
                  <ul className="space-y-3 mb-6">
                    <li className="flex items-center gap-2 text-slate-600">
                      <span className="w-5 h-5 text-purple-600">✓</span>
                      {tier.queriesPerMonth === -1 ? "Unlimited queries/month" : `${tier.queriesPerMonth.toLocaleString()} queries/month`}
                    </li>
                    <li className="flex items-center gap-2 text-slate-600">
                      <span className="w-5 h-5 text-purple-600">✓</span>
                      {tier.rateLimit} requests/minute
                    </li>
                    <li className="flex items-center gap-2 text-slate-600">
                      <span className="w-5 h-5 text-purple-600">✓</span>
                      {tier.models.length} models available
                    </li>
                  </ul>
                  <button
                    className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                      tier.id === user?.prefs?.subscriptionTier
                        ? "bg-slate-200 text-slate-600 cursor-not-allowed"
                        : "bg-purple-600 text-white hover:bg-purple-700"
                    }`}
                    disabled={tier.id === user?.prefs?.subscriptionTier}
                  >
                    {tier.id === user?.prefs?.subscriptionTier ? "Current Plan" : tier.price === 0 ? "Start Free" : "Upgrade"}
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.section>
        </main>
      </div>
    </ProtectedRoute>
  );
}