"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Shield, Cpu, Globe, ArrowRight, BarChart2, Layers, Target, Brain } from "lucide-react";
import { toast } from "react-hot-toast";
import type { SustainabilityMetrics } from "@/types/multi-llm";
import { useAuth } from "@/components/auth/AuthProvider";

const quickPrompts = [
  "Explain quantum computing in simple terms",
  "What are the risks of relying on a single AI model?",
  "How can I reduce my carbon footprint?",
];

export default function HomePage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<
    null | { answer: string; metrics: SustainabilityMetrics; deep_review_confidence?: number | null }
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [deepReview, setDeepReview] = useState(false);

  const plan = user?.profile?.plan || "free";
  const deepReviewAvailable = plan === "pro" || plan === "enterprise";

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) {
      setProjects([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/client-projects");
        const json = await res.json();
        setProjects(json.projects || []);
      } catch {
        setProjects([]);
      }
    })();
  }, [user?.id]);

  const runQuery = async (text: string) => {
    if (!text.trim()) return;
    setQuery(text);
    setIsLoading(true);
    const toastId = toast.loading("Querying ensemble of LLMs...");

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          project_id: selectedProjectId || undefined,
          deep_review: deepReviewAvailable && deepReview,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Ensemble query failed (${res.status})`);
      }
      const answer = await res.json();
      
      toast.success("Ensemble complete!", { id: toastId });
      setResult(answer);
      
      queryClient.invalidateQueries(['user-stats']);
      
    } catch (error) {
      toast.error(`Query failed: ${(error as Error).message}`, { id: toastId });
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runQuery(query);
  };

  return (
    <div className="space-y-12">
      {/* Hero Section - Multi-LLM Focus */}
      <section className="text-center py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-4">
            MultiLLM
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto mb-8">
            One prompt. <span className="font-semibold text-purple-600">Multiple LLMs.</span> 
            The best answer, automatically selected.
          </p>
          
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            {[
              { icon: Brain, label: "Ensemble Scoring", color: "text-purple-600" },
              { icon: Target, label: "Best Answer Selection", color: "text-blue-600" },
              { icon: Layers, label: "Multi-Provider", color: "text-emerald-600" },
              { icon: Shield, label: "Privacy First", color: "text-orange-600" }
            ].map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm"
                >
                  <Icon className={`w-5 h-5 ${feature.color}`} />
                  <span className="text-sm font-medium text-slate-700">{feature.label}</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Query Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-2xl mx-auto"
        >
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything... (e.g., 'Explain quantum computing')"
              className="flex-1 px-6 py-4 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all text-lg"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-8 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white rounded-xl font-semibold transition-colors flex items-center gap-2"
            >
              {isLoading ? "Running ensemble..." : "Ask MultiLLM"}
              <Zap className="w-5 h-5" />
            </button>
          </form>

          {projects.length > 0 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <label htmlFor="project-select" className="text-sm text-slate-500">
                Tag this query to:
              </label>
              <select
                id="project-select"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700"
                disabled={isLoading}
              >
                <option value="">No client project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {user && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <label
                className={`flex items-center gap-2 text-sm ${deepReviewAvailable ? "text-slate-600" : "text-slate-400"}`}
              >
                <input
                  type="checkbox"
                  checked={deepReviewAvailable && deepReview}
                  onChange={(e) => setDeepReview(e.target.checked)}
                  disabled={!deepReviewAvailable || isLoading}
                />
                Deep Review (cross-check with an extra model call for a confidence score)
              </label>
              {!deepReviewAvailable && (
                <a href="/dashboard/billing" className="text-xs text-purple-600 underline">
                  Upgrade to enable
                </a>
              )}
            </div>
          )}

          {/* Quick prompts */}
          <div className="mt-5">
            <p className="text-sm font-medium text-slate-500 mb-3">Try a quick prompt:</p>
            <div className="flex flex-wrap justify-center gap-3">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => runQuery(prompt)}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-full bg-white border border-slate-200 text-sm text-slate-600 hover:border-purple-400 hover:text-purple-600 hover:shadow-sm disabled:opacity-50 transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Results Section */}
      <AnimatePresence>
        {result && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="max-w-4xl mx-auto"
          >
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-slate-900">Best Answer</h2>
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                  Ensemble Selected
                </span>
              </div>
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed mb-6">
                {result.answer}
              </p>
              
              {/* Compact metrics row - sustainability as small bonus */}
              <div className="pt-6 border-t border-slate-200">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                  <div>
                    <div className="text-xl font-bold text-purple-600">
                      {(result.metrics.accuracy * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-slate-500">Confidence</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-blue-600">
                      {result.metrics.latency_s.toFixed(2)}s
                    </div>
                    <div className="text-xs text-slate-500">Latency</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-emerald-600">
                      {result.metrics.carbon_saved_g.toFixed(2)}g
                    </div>
                    <div className="text-xs text-slate-500">CO₂ Saved</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-orange-600">
                      {result.metrics.emissions_g.toFixed(4)}g
                    </div>
                    <div className="text-xs text-slate-500">Emissions</div>
                  </div>
                  {typeof result.deep_review_confidence === "number" && (
                    <div>
                      <div className="text-xl font-bold text-rose-600">
                        {(result.deep_review_confidence * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs text-slate-500">Deep Review Confidence</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Features Section - Multi-LLM Focus */}
      <section className="py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Why MultiLLM?</h2>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Single models hallucinate. Ensembles don&apos;t. We run your prompt across multiple providers and score every response.
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {[
            {
              icon: Brain,
              title: "Ensemble Intelligence",
              description: "Run one prompt across OpenAI, Gemini, Mistral, and local models simultaneously"
            },
            {
              icon: Target,
              title: "Automatic Best Selection",
              description: "Source-grounded scoring picks the most accurate, least biased answer every time"
            },
            {
              icon: Layers,
              title: "Multi-Provider Redundancy",
              description: "If one provider fails, the ensemble continues. No single point of failure."
            }
          ].map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileHover={{ scale: 1.05, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all"
              >
                <Icon className="w-12 h-12 text-purple-600 mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600">{feature.description}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Technical Details */}
      <section className="py-16 bg-slate-50 rounded-2xl">
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">How It Works</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Transparent ensemble pipeline — you see every candidate, every score, every source.
            </p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: "1", title: "Parallel Query", desc: "Your prompt sent to all configured providers at once" },
              { step: "2", title: "Source Retrieval", desc: "Relevant docs fetched per provider for grounding" },
              { step: "3", title: "Multi-Dimensional Scoring", desc: "Source support, bias detection, clarity scored per candidate" },
              { step: "4", title: "Best Answer Returned", desc: "Highest-scoring response delivered with full traceability" }
            ].map((item, index) => (
              <div key={index} className="text-center p-4">
                <div className="w-14 h-14 bg-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 font-bold text-xl">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">{item.title}</h3>
                <p className="text-sm text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="text-center py-16 bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">Stop Guessing. Start Ensembling.</h2>
        <p className="text-slate-600 mb-8 max-w-2xl mx-auto">
          Get better answers by running every prompt across multiple LLMs and automatically selecting the best one.
        </p>
        <button className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-xl font-semibold transition-colors flex items-center gap-2 mx-auto">
          Try MultiLLM Free
          <ArrowRight className="w-5 h-5" />
        </button>
      </section>
    </div>
  );
}