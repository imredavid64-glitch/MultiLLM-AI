"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, Plus, Trash2, AlertCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { toast } from "react-hot-toast";
import DashboardHeader from "@/components/layout/dashboard-header";

interface ClientProject {
  id: string;
  name: string;
  created_at: string;
}

export default function ClientProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [limit, setLimit] = useState<number | null>(5);
  const [plan, setPlan] = useState<string>("free");
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/client-projects");
      const data = await res.json();
      setProjects(data.projects || []);
      setLimit(data.limit ?? null);
      setPlan(data.plan || "free");
    } catch {
      toast.error("Could not load client projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const atLimit = limit !== null && projects.length >= limit;

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Please enter a client project name");
      return;
    }
    try {
      const res = await fetch("/api/client-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create client project");
        return;
      }
      setProjects((prev) => [data.project, ...prev]);
      setShowCreateModal(false);
      setNewName("");
      toast.success("Client project created.");
    } catch {
      toast.error("Failed to create client project");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this client project? Past queries stay logged, but new ones can't be tagged to it.")) return;
    try {
      const res = await fetch(`/api/client-projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setProjects((prev) => prev.filter((p) => p.id !== id));
      toast.success("Client project removed.");
    } catch {
      toast.error("Failed to remove client project");
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        <DashboardHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8"
          >
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Client Projects</h1>
              <p className="text-slate-600 mt-1">
                Track usage and quality per end-client. Tag queries to a project from the query screen.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={atLimit}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              New Client Project
            </button>
          </motion.div>

          {limit !== null && (
            <p className="text-sm text-slate-500 mb-4">
              {projects.length} / {limit} client projects used on your {plan} plan
              {atLimit && (
                <span className="text-amber-600 font-medium"> — upgrade to add more.</span>
              )}
            </p>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
          >
            {loading ? (
              <div className="p-12 text-center text-slate-500">Loading...</div>
            ) : projects.length === 0 ? (
              <div className="p-12 text-center">
                <Briefcase className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">No client projects yet</h3>
                <p className="text-slate-500 mb-6">
                  Create one per end-client so their queries and quality metrics can be reported separately.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors inline-flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  New Client Project
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {projects.map((project) => (
                  <div key={project.id} className="p-6 flex items-center justify-between hover:bg-slate-50">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-purple-100">
                        <Briefcase className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{project.name}</h3>
                        <p className="text-sm text-slate-500">
                          Created {new Date(project.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {atLimit && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <p className="text-sm text-amber-800">
                You&apos;ve reached your plan&apos;s client project limit.{" "}
                <a href="/dashboard/billing" className="underline font-medium">
                  Upgrade your plan
                </a>{" "}
                to track more clients.
              </p>
            </div>
          )}
        </main>

        {/* Create Project Modal */}
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
              className="bg-white rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-4">New Client Project</h2>
              <p className="text-slate-600 mb-6">
                Give it a name so you can tag queries and report on this client separately.
              </p>

              <div className="mb-6">
                <label htmlFor="projectName" className="block text-sm font-medium text-slate-700 mb-1">
                  Project Name
                </label>
                <input
                  id="projectName"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Acme Corp, Internal Tools"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewName("");
                  }}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </ProtectedRoute>
  );
}
