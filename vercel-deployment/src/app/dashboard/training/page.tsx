"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Cloud, Cpu, Database, HardDrive, Layers, Play, Upload, Trash2, Download } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

const mockTrainingJobs = [
  {
    id: "job_1",
    name: "TinyGPT ensemble-generator (from scratch)",
    status: "completed" as const,
    progress: 100,
    baseModel: "scratch-tinygpt",
    epochs: 30,
    learningRate: 0.003,
    createdAt: "2026-08-05T00:00:00Z",
    completedAt: "2026-08-05T00:21:00Z",
    modelPath: "/models/ensemble-generator",
  },
  {
    id: "job_2",
    name: "TinyScorer answer-quality regressor",
    status: "completed" as const,
    progress: 100,
    baseModel: "scratch-tinygpt",
    epochs: 40,
    learningRate: 0.003,
    createdAt: "2026-08-05T00:22:00Z",
    completedAt: "2026-08-05T00:23:30Z",
    modelPath: "/models/ensemble-scorer",
  },
  {
    id: "job_3",
    name: "Retrain on user corpus",
    status: "pending" as const,
    progress: 0,
    baseModel: "scratch-tinygpt",
    epochs: 30,
    learningRate: 0.003,
    createdAt: "2026-08-05T09:00:00Z",
    estimatedCompletion: "2026-08-05T09:30:00Z",
  },
  {
    id: "job_4",
    name: "Fine-tune Gemma-7B on custom data",
    status: "training" as const,
    progress: 45,
    baseModel: "gemma-2b",
    epochs: 3,
    learningRate: 0.0002,
    createdAt: "2026-08-05T00:00:00Z",
    estimatedCompletion: "2026-08-05T12:00:00Z",
  },
];

export default function TrainingPage() {
  const { user } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newJobName, setNewJobName] = useState("");
  const [newJobBaseModel, setNewJobBaseModel] = useState("scratch-tinygpt");
  const [newJobEpochs, setNewJobEpochs] = useState(3);
  const [newJobLearningRate, setNewJobLearningRate] = useState(0.0002);

  const baseModels = [
    { id: "scratch-tinygpt", name: "TinyGPT (scratch)", params: "0.5M", company: "MultiLLM" },
    { id: "ensemble-generator", name: "Ensemble Generator", params: "0.5M", company: "MultiLLM" },
    { id: "ensemble-scorer", name: "Answer Scorer", params: "0.3M", company: "MultiLLM" },
    { id: "gemma-2b", name: "Gemma 2B", params: "2B", company: "Google" },
    { id: "mistral-7b", name: "Mistral 7B", params: "7B", company: "Mistral AI" },
  ];

  const handleCreateJob = () => {
    if (!newJobName.trim()) return;
    // In a real app, this would create a training job in the database
    console.log("Creating training job:", {
      name: newJobName,
      baseModel: newJobBaseModel,
      epochs: newJobEpochs,
      learningRate: newJobLearningRate,
    });
    setShowCreateModal(false);
    setNewJobName("");
    setNewJobBaseModel("gemma-2b");
    setNewJobEpochs(3);
    setNewJobLearningRate(0.0002);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-slate-100 text-slate-700";
      case "training": return "bg-blue-100 text-blue-700";
      case "completed": return "bg-emerald-100 text-emerald-700";
      case "failed": return "bg-red-100 text-red-700";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const formatDuration = (start: string, end?: string) => {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? `${diffDays} day${diffDays > 1 ? "s" : ""}` : "< 1 day";
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
                  <a href="/dashboard/training" className="text-purple-600 font-medium">Training</a>
                  <a href="/dashboard/analytics" className="text-slate-700 hover:text-purple-600 font-medium">Analytics</a>
                  <a href="/dashboard/settings" className="text-slate-700 hover:text-purple-600 font-medium">Settings</a>
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
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8"
          >
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Model Training</h1>
              <p className="text-slate-600 mt-1">Distill and fine-tune models for your specific use cases</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2"
              disabled={user?.prefs?.subscriptionTier === "free"}
            >
              <Play className="w-5 h-5" />
              Start New Training
            </button>
          </motion.div>

          {/* Feature Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
          >
            {[
              { icon: Cloud, title: "Cloud Training", desc: "Leverage GPU resources in the cloud for faster training", available: user?.prefs?.subscriptionTier !== "free" },
              { icon: HardDrive, title: "Local Training", desc: "Train models on your own hardware", available: true },
              { icon: Database, title: "Model Registry", desc: "Store, version, and manage your custom models", available: true },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                className={`p-6 rounded-2xl border transition-all ${
                  feature.available
                    ? "bg-white border-slate-200 hover:shadow-md"
                    : "bg-slate-50 border-slate-200 opacity-60"
                }`}
              >
                <feature.icon className="w-8 h-8 text-purple-600 mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-600">{feature.desc}</p>
                {!feature.available && (
                  <div className="mt-3 inline-block px-3 py-1 bg-slate-200 text-slate-600 rounded-full text-xs font-medium">
                    Pro Feature
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>

          {/* Training Jobs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-semibold text-slate-900">Your Training Jobs</h2>
            </div>

            {mockTrainingJobs.length === 0 ? (
              <div className="p-12 text-center">
                <Cpu className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">No training jobs yet</h3>
                <p className="text-slate-500 mb-6">Start your first model training session to create custom models</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors inline-flex items-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  Start Training
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {mockTrainingJobs.map((job) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="p-6 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${job.status === "training" ? "bg-blue-100" : job.status === "completed" ? "bg-emerald-100" : "bg-slate-100"}`}>
                          <Cpu className={`w-6 h-6 ${job.status === "training" ? "text-blue-600" : job.status === "completed" ? "text-emerald-600" : "text-slate-600"}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-900">{job.name}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>{job.status}</span>
                          </div>
                          <p className="text-sm text-slate-500">Base model: {job.baseModel}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm text-slate-500">Progress</div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-24 bg-slate-200 rounded-full h-2">
                            <div
                              className="bg-purple-600 h-2 rounded-full transition-all"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-slate-900">{job.progress}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-slate-500">Created</div>
                        <div className="font-medium text-slate-900">{formatDate(job.createdAt)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Duration</div>
                        <div className="font-medium text-slate-900">
                          {job.status === "pending" ? "Upcoming" : job.status === "training" ? "In Progress" : formatDuration(job.createdAt, job.completedAt)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Epochs</div>
                        <div className="font-medium text-slate-900">{job.epochs}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Learning Rate</div>
                        <div className="font-medium text-slate-900">{job.learningRate}</div>
                      </div>
                    </div>

                    {job.status === "completed" && (
                      <div className="mt-4 pt-4 border-t border-slate-100 flex gap-3">
                        <button className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
                          <Download className="w-4 h-4" />
                          Download Model
                        </button>
                        <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors">
                          View Details
                        </button>
                      </div>
                    )}

                    {job.status === "training" && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <div className="text-sm text-blue-800">
                            <strong>Estimated completion:</strong> {formatDate(job.estimatedCompletion)}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Training Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 p-6 bg-purple-50 rounded-2xl border border-purple-100"
          >
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-600" />
              Model Training Guidelines
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-600">
              <div>
                <h4 className="font-medium text-slate-900 mb-2">Pipeline</h4>
                <ul className="space-y-1">
                  <li>• Builds a synthetic corpus from the ensemble architecture</li>
                  <li>• Trains a TinyGPT (0.5M params) from random weights</li>
                  <li>• Trains an answer-quality scorer on labeled examples</li>
                  <li>• Run locally: <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">python -m train.train</code></li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-slate-900 mb-2">Models</h4>
                <ul className="space-y-1">
                  <li>• ensemble-generator: offline ensemble candidate</li>
                  <li>• ensemble-scorer: source/bias/clarity regression</li>
                  <li>• 50/50 heuristic + learned scoring blend</li>
                </ul>
              </div>
            </div>
          </motion.div>
        </main>

        {/* Create Job Modal */}
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Start New Training Job</h2>

              <div className="space-y-6">
                <div>
                  <label htmlFor="jobName" className="block text-sm font-medium text-slate-700 mb-1">
                    Job Name
                  </label>
                  <input
                    id="jobName"
                    type="text"
                    value={newJobName}
                    onChange={(e) => setNewJobName(e.target.value)}
                    placeholder="e.g., TinyGPT from scratch, Retrain on corpus"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="baseModel" className="block text-sm font-medium text-slate-700 mb-1">
                      Base Model
                    </label>
                    <select
                      id="baseModel"
                      value={newJobBaseModel}
                      onChange={(e) => setNewJobBaseModel(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                    >
                      {baseModels.map((model) => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="epochs" className="block text-sm font-medium text-slate-700 mb-1">
                      Epochs
                    </label>
                    <input
                      id="epochs"
                      type="number"
                      min="1"
                      max="50"
                      value={newJobEpochs}
                      onChange={(e) => setNewJobEpochs(parseInt(e.target.value) || 1)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="learningRate" className="block text-sm font-medium text-slate-700 mb-1">
                    Learning Rate
                  </label>
                  <input
                    id="learningRate"
                    type="number"
                    step="0.0001"
                    min="0.00001"
                    max="0.01"
                    value={newJobLearningRate}
                    onChange={(e) => setNewJobLearningRate(parseFloat(e.target.value) || 0.0001)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                  />
                </div>

                <div className="bg-slate-50 p-4 rounded-xl">
                  <h4 className="font-medium text-slate-900 mb-2">Resource Estimate</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-slate-500">Est. Time</div>
                      <div className="font-medium text-slate-900">
                        {newJobBaseModel.startsWith("scratch") || newJobBaseModel.startsWith("ensemble")
                          ? newJobEpochs <= 10 ? "20 seconds" : "~1 minute"
                          : newJobEpochs === 1 ? "5-10 minutes" : newJobEpochs <= 5 ? "30-60 minutes" : newJobEpochs <= 10 ? "2-3 hours" : "6-12 hours"}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">GPU Memory</div>
                      <div className="font-medium text-slate-900">
                        {newJobBaseModel.startsWith("scratch") || newJobBaseModel.startsWith("ensemble") ? "MPS/CPU" : newJobBaseModel.includes("7b") ? "8GB+" : "4GB+"}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Cost</div>
                      <div className="font-medium text-slate-900">
                        {newJobBaseModel.startsWith("scratch") || newJobBaseModel.startsWith("ensemble") ? "Free (local)" : newJobEpochs === 1 ? "~$0.10" : newJobEpochs <= 5 ? "~$1.00" : newJobEpochs <= 10 ? "~$5.00" : "~$25.00"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateJob}
                  className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  Start Training
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </ProtectedRoute>
  );
}