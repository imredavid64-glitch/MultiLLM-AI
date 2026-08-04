"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Leaf, Shield, Users, ArrowRight, Download, FileText, BarChart2, Cpu, Globe } from "lucide-react";
import { MultiLLM } from "@/lib/multi-llm";
import { toast } from "react-hot-toast";
import type { SustainabilityMetrics } from "@/types/multi-llm";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<null | { answer: string; metrics: SustainabilityMetrics }>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const queryClient = useQueryClient();

  const multiLLM = new MultiLLM();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setIsLoading(true);
    const toastId = toast.loading("Processing your query with sustainable AI...");
    
    try {
      const answer = await multiLLM.query(query, {
        temperature: 0.2,
        max_tokens: 1024,
        top_p: 1.0,
        repetition_penalty: 1.0
      });
      
      toast.success("Query completed successfully!", { id: toastId });
      setResult(answer);
      
      // Refresh user stats
      queryClient.invalidateQueries(['user-stats']);
      
    } catch (error) {
      toast.error(`Query failed: ${(error as Error).message}`, { id: toastId });
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-4">
            MultiLLM SaaS
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto mb-8">
            The first <span className="font-semibold text-emerald-600">carbon-neutral</span>, 
            <span className="font-semibold text-blue-600">privacy-first</span> AI platform 
            with zero API key costs and multi-language support.
          </p>
          
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            {[
              { icon: Leaf, label: "Carbon Neutral", color: "text-emerald-600" },
              { icon: Shield, label: "Privacy First", color: "text-blue-600" },
              { icon: Cpu, label: "Multi-Language", color: "text-purple-600" },
              { icon: Globe, label: "Global Network", color: "text-orange-600" }
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
              className="flex-1 px-6 py-4 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-lg"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl font-semibold transition-colors flex items-center gap-2"
            >
              {isLoading ? "Processing..." : "Ask AI"}
              <Zap className="w-5 h-5" />
            </button>
          </form>
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
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Response</h2>
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                {result.answer}
              </p>
              
              <div className="mt-6 pt-6 border-t border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Sustainability Metrics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600">
                      {result.metrics.carbon_saved_g.toFixed(2)}g
                    </div>
                    <div className="text-xs text-slate-600">CO₂ Saved</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {result.metrics.latency_s.toFixed(2)}s
                    </div>
                    <div className="text-xs text-slate-600">Latency</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {(result.metrics.accuracy * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-slate-600">Accuracy</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {result.metrics.emissions_g.toFixed(4)}g
                    </div>
                    <div className="text-xs text-slate-600">Emissions</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Features Section */}
      <section className="py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Platform Features</h2>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Experience the future of AI computing with our comprehensive platform
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {[
            {
              icon: BarChart2,
              title: "Real-time Analytics",
              description: "Monitor carbon footprint, accuracy, and performance metrics in real-time"
            },
            {
              icon: Download,
              title: "Multi-Format Export",
              description: "Download results in JSON, PDF, or CSV format for analysis"
            },
            {
              icon: Users,
              title: "Collaborative Features",
              description: "Share results, create teams, and collaborate on sustainability goals"
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
                <Icon className="w-12 h-12 text-emerald-600 mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600">{feature.description}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* CTA Section */}
      <section className="text-center py-16 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-2xl">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">Ready to Go Carbon-Neutral?</h2>
        <p className="text-slate-600 mb-8 max-w-2xl mx-auto">
          Join thousands of organizations already using our zero-cost AI platform
        </p>
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-semibold transition-colors flex items-center gap-2 mx-auto">
          Start Free Trial
          <ArrowRight className="w-5 h-5" />
        </button>
      </section>
    </div>
  );
}