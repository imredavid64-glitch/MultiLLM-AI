"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { TrendingUp, Users, Activity, DollarSign, Clock, Target, Brain, BarChart3, Download } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";


const mockAnalyticsData = {
  overview: [
    { name: "Jan", queries: 2847, accuracy: 94.2, carbonSaved: 342 },
    { name: "Feb", queries: 9500, accuracy: 95.1, carbonSaved: 1156 },
    { name: "Mar", queries: 8200, accuracy: 93.8, carbonSaved: 987 },
    { name: "Apr", queries: 7500, accuracy: 94.5, carbonSaved: 892 },
    { name: "May", queries: 6800, accuracy: 94.9, carbonSaved: 812 },
    { name: "Jun", queries: 7100, accuracy: 95.2, carbonSaved: 853 },
  ],
  modelPerformance: [
    { model: "Gemma-2B", accuracy: 94.2, latency: 1.2, carbonPerQuery: 0.034 },
    { model: "Qwen-1.8B", accuracy: 95.1, latency: 0.9, carbonPerQuery: 0.028 },
    { model: "Mistral-7B", accuracy: 93.8, latency: 1.5, carbonPerQuery: 0.042 },
    { model: "Llama-3-8B", accuracy: 94.5, latency: 1.1, carbonPerQuery: 0.031 },
  ],
  usageByTier: [
    { name: "Free", value: 15, color: "#6b7280" },
    { name: "Pro", value: 75, color: "#8b5cf6" },
    { name: "Enterprise", value: 10, color: "#10b981" },
  ],
  hourlyData: Array.from({ length: 24 }, (_, i) => ({
    hour: `${i.toString().padStart(2, "0")}:00`,
    queries: Math.floor(Math.random() * 100) + 50,
    accuracy: 94 + Math.random() * 3,
  })),
};

const MetricCard = ({ title, value, change, icon: Icon, color }: {
  title: string;
  value: string | number;
  change: string;
  icon: any;
  color: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white rounded-xl shadow-sm border border-slate-100 p-6"
  >
    <div className="flex items-center justify-between mb-4">
      <div className={`p-3 rounded-xl ${color} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <span className={`text-sm font-medium ${color === "text-emerald-600" ? "text-emerald-600" : color === "text-purple-600" ? "text-purple-600" : color === "text-blue-600" ? "text-blue-600" : color === "text-orange-600" ? "text-orange-600" : "text-slate-600"}`}>{change}</span>
    </div>
    <h3 className="text-sm font-medium text-slate-600 mb-1">{title}</h3>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
  </motion.div>
);

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState("6m");

  const metrics = [
    { title: "Total Queries", value: "68,647", change: "+15.2%", icon: Activity, color: "text-blue-600" },
    { title: "Avg Accuracy", value: "94.7%", change: "+0.3%", icon: Target, color: "text-emerald-600" },
    { title: "CO₂ Saved", value: "3,555g", change: "+12.1%", icon: Brain, color: "text-purple-600" },
    { title: "Revenue", value: "$290", change: "+8.4%", icon: DollarSign, color: "text-orange-600" },
  ];

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
                  <a href="/dashboard/analytics" className="text-purple-600 font-medium">Analytics</a>
                  <a href="/dashboard/settings" className="text-slate-700 hover:text-purple-600 font-medium">Settings</a>
                  <a href="/dashboard/billing" className="text-slate-700 hover:text-purple-600 font-medium">Billing</a>
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
          {/* Page Header & Controls */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8"
          >
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Analytics Dashboard</h1>
              <p className="text-slate-600 mt-1">Comprehensive insights into your Multi-LLM usage and performance</p>
            </div>

            <div className="flex gap-2">
              {[
                { value: "1m", label: "1M" },
                { value: "3m", label: "3M" },
                { value: "6m", label: "6M" },
                { value: "1y", label: "1Y" },
                { value: "all", label: "All" },
              ].map((range) => (
                <button
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                    timeRange === range.value
                      ? "bg-purple-600 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Metrics Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          >
            {metrics.map((metric, index) => (
              <MetricCard key={metric.title} {...metric} />
            ))}
          </motion.div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Usage Over Time */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-slate-900">Usage Over Time</h2>
                <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                  <Download className="w-4 h-4" />
                </button>
              </div>

              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={mockAnalyticsData.overview}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{ border: "none", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}
                    formatter={(value, name) => [`${Number(value ?? 0).toLocaleString()}`, name]}
                  />
                  <Line type="monotone" dataKey="queries" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Model Performance */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6"
            >
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Model Performance</h2>

              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mockAnalyticsData.modelPerformance}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="model" stroke="#64748b" fontSize={12} />
                  <YAxis yAxisId="left" stroke="#64748b" fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{ border: "none", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}
                    formatter={(value, name) => [`${Number(value ?? 0).toFixed(1)}`, name]}
                  />
                  <Bar yAxisId="left" dataKey="accuracy" fill="#10b981" />
                  <Line yAxisId="right" type="monotone" dataKey="latency" stroke="#f59e0b" strokeWidth={2} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Usage by Subscription Tier */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6"
            >
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Users by Tier</h2>

              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={mockAnalyticsData.usageByTier}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {mockAnalyticsData.usageByTier.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ border: "none", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}
                    formatter={(value, name) => [`${Number(value ?? 0)}%`, name]}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Hourly Usage */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6"
            >
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Hourly Usage</h2>

              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mockAnalyticsData.hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hour" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{ border: "none", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}
                    formatter={(value, name) => [`${Number(value ?? 0)}`, name]}
                  />
                  <Bar dataKey="queries" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Detailed Analytics Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-semibold text-slate-900">Detailed Analytics</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Date</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Queries</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Avg Accuracy</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">CO₂ Saved</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Queries/min</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mockAnalyticsData.overview.map((day, index) => (
                    <tr key={day.name} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm text-slate-900">{day.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-900">{day.queries.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-slate-900">{day.accuracy}%</td>
                      <td className="px-6 py-4 text-sm text-slate-900">{day.carbonSaved}g</td>
                      <td className="px-6 py-4 text-sm text-slate-900">{(day.queries / 30).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </main>
      </div>
    </ProtectedRoute>
  );
}