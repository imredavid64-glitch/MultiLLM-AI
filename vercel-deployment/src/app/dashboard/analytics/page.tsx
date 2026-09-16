"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { Activity, Clock, Target, Brain } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import DashboardHeader from "@/components/layout/dashboard-header";

interface AnalyticsData {
  overview: { name: string; queries: number; accuracy: number; carbonSaved: number }[];
  modelPerformance: { model: string; accuracy: number; latency: number; carbonPerQuery: number }[];
  usageByProvider: { name: string; value: number; color: string }[];
  hourlyData: { hour: string; queries: number }[];
  totals: { totalQueries: number; avgAccuracy: number; totalCarbonSaved: number; avgLatencyMs: number };
}

const EMPTY: AnalyticsData = {
  overview: [],
  modelPerformance: [],
  usageByProvider: [],
  hourlyData: [],
  totals: { totalQueries: 0, avgAccuracy: 0, totalCarbonSaved: 0, avgLatencyMs: 0 },
};

const MetricCard = ({ title, value, icon: Icon, color }: {
  title: string;
  value: string | number;
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
    </div>
    <h3 className="text-sm font-medium text-slate-600 mb-1">{title}</h3>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
  </motion.div>
);

export default function AnalyticsPage() {
  const { user } = useAuth();
  const userId = user?.id || "";
  const [data, setData] = useState<AnalyticsData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics?user_id=${encodeURIComponent(userId)}`);
        const json = await res.json();
        setData({ ...EMPTY, ...json });
      } catch {
        setData(EMPTY);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const metrics = [
    { title: "Total Queries", value: data.totals.totalQueries.toLocaleString(), icon: Activity, color: "text-blue-600" },
    { title: "Avg Accuracy", value: `${data.totals.avgAccuracy}%`, icon: Target, color: "text-emerald-600" },
    { title: "CO₂ Saved", value: `${data.totals.totalCarbonSaved}g`, icon: Brain, color: "text-purple-600" },
    { title: "Avg Latency", value: `${(data.totals.avgLatencyMs / 1000).toFixed(2)}s`, icon: Clock, color: "text-orange-600" },
  ];

  const hasData = data.totals.totalQueries > 0;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        <DashboardHeader />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold text-slate-900">Analytics Dashboard</h1>
            <p className="text-slate-600 mt-1">Insights into your Multi-LLM usage and performance</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          >
            {metrics.map((metric) => (
              <MetricCard key={metric.title} {...metric} />
            ))}
          </motion.div>

          {loading ? (
            <div className="text-center py-16 text-slate-500">Loading analytics...</div>
          ) : !hasData ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 text-center text-slate-500">
              No queries yet. Ask a question from the home page to start building your analytics.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6"
                >
                  <h2 className="text-xl font-semibold text-slate-900 mb-6">Queries Over Time</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data.overview}>
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

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6"
                >
                  <h2 className="text-xl font-semibold text-slate-900 mb-6">Performance by Provider</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.modelPerformance}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="model" stroke="#64748b" fontSize={12} />
                      <YAxis yAxisId="left" stroke="#64748b" fontSize={12} />
                      <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={12} />
                      <Tooltip
                        contentStyle={{ border: "none", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}
                        formatter={(value, name) => [`${Number(value ?? 0).toFixed(2)}`, name]}
                      />
                      <Bar yAxisId="left" dataKey="accuracy" fill="#10b981" />
                      <Line yAxisId="right" type="monotone" dataKey="latency" stroke="#f59e0b" strokeWidth={2} />
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6"
                >
                  <h2 className="text-xl font-semibold text-slate-900 mb-6">Queries by Provider</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={data.usageByProvider}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {data.usageByProvider.map((entry, index) => (
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

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6"
                >
                  <h2 className="text-xl font-semibold text-slate-900 mb-6">Usage by Hour of Day</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.hourlyData}>
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

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
              >
                <div className="p-6 border-b border-slate-100">
                  <h2 className="text-xl font-semibold text-slate-900">Daily Breakdown</h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Date</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Queries</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Avg Accuracy</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">CO₂ Saved</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.overview.map((day) => (
                        <tr key={day.name} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm text-slate-900">{day.name}</td>
                          <td className="px-6 py-4 text-sm text-slate-900">{day.queries.toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-slate-900">{day.accuracy}%</td>
                          <td className="px-6 py-4 text-sm text-slate-900">{day.carbonSaved}g</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
