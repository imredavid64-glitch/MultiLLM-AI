"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Clock, Database, HardDrive } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import DashboardHeader from "@/components/layout/dashboard-header";

interface TrainingData {
  models: Array<{ id: string; name: string; params: number; nLayer: number; nEmbd: number; blockSize: number }>;
  corpus: { docs: number; chars: number };
}

const formatParams = (n: number) => {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};

export default function TrainingPage() {
  const { data: training, isLoading } = useQuery<TrainingData>({
    queryKey: ["training"],
    queryFn: async () => {
      const res = await fetch("/api/training");
      if (!res.ok) throw new Error("Failed to load training data");
      return res.json();
    },
  });

  const registryModels = training?.models ?? [];
  const corpus = training?.corpus ?? { docs: 0, chars: 0 };

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
            <h1 className="text-3xl font-bold text-slate-900">Model Training</h1>
            <p className="text-slate-600 mt-1">Distill and fine-tune models for your specific use cases</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8 p-6 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-4"
          >
            <Clock className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-slate-900 mb-1">Coming soon</h2>
              <p className="text-sm text-slate-700">
                Starting a real training run from the dashboard isn&apos;t available yet. The training service needs{" "}
                <code className="text-xs bg-white px-1.5 py-0.5 rounded border border-amber-200">torch</code>, whose
                bundle exceeds our current hosting plan&apos;s function size limit, and real training runs can run
                longer than that plan&apos;s function duration cap regardless. We&apos;re working on a fix -- training
                jobs won&apos;t silently fail once this reopens, they just aren&apos;t offered yet.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-purple-600" />
              Model Registry
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              The models currently powering the ensemble&apos;s offline candidate and scorer -- trained from scratch,
              not placeholders.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {registryModels.length > 0 ? (
                registryModels.map((model) => (
                  <div key={model.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-slate-900">{model.name}</h3>
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">ready</span>
                    </div>
                    <div className="text-3xl font-bold text-purple-600 mb-1">{formatParams(model.params)}</div>
                    <div className="text-sm text-slate-500 mb-4">parameters</div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-slate-500">Layers</div>
                        <div className="font-medium text-slate-900">{model.nLayer}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Embedding</div>
                        <div className="font-medium text-slate-900">{model.nEmbd}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Context</div>
                        <div className="font-medium text-slate-900">{model.blockSize}</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-500">
                  {isLoading ? "Loading model registry..." : "No trained models found. Run `python -m train.train` to train them."}
                </div>
              )}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="w-4 h-4 text-blue-600" />
                  <h3 className="font-semibold text-slate-900">Training Corpus</h3>
                </div>
                <div className="text-3xl font-bold text-blue-600 mb-1">{corpus.docs.toLocaleString()}</div>
                <div className="text-sm text-slate-500 mb-4">chat-style docs</div>
                <div className="text-sm text-slate-600">{(corpus.chars / 1_000_000).toFixed(1)}M chars · synthetic + knowledge_sources</div>
              </div>
            </div>
          </motion.div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
