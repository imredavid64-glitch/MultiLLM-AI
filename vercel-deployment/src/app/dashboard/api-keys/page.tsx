"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Key, Copy, Trash2, Shield, Clock, AlertCircle, CheckCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { toast } from "react-hot-toast";
import DashboardHeader from "@/components/layout/dashboard-header";

interface ApiKeySummary {
  id: string;
  name: string;
  tier: "free" | "pro" | "enterprise";
  key_prefix: string;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
}

export default function ApiKeysPage() {
  const { user } = useAuth();
  const userId = user?.id || "";

  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyTier, setNewKeyTier] = useState<"free" | "pro" | "enterprise">(
    (user?.profile?.plan as "free" | "pro" | "enterprise") || "free"
  );
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/api-keys");
      const data = await res.json();
      setKeys(data.keys || []);
    } catch {
      toast.error("Could not load API keys");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("Please enter a name for your API key");
      return;
    }
    if (!userId) return;

    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName, tier: newKeyTier }),
      });
      if (!res.ok) throw new Error("Request failed");
      const created = await res.json();

      setRevealedKey(created.key);
      setShowCreateModal(false);
      setNewKeyName("");
      toast.success("API key created! Save it now - you won't see it again.");
      await loadKeys();
    } catch {
      toast.error("Failed to create API key");
    }
  };

  const copyToClipboard = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const deleteKey = async (id: string) => {
    if (!userId) return;
    if (!confirm("Are you sure you want to delete this API key? This cannot be undone.")) return;

    try {
      const res = await fetch(`/api/api-keys/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Request failed");
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success("API key deleted");
    } catch {
      toast.error("Failed to delete API key");
    }
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const getTierBadge = (tier: string) => {
    const styles = {
      free: "bg-slate-100 text-slate-700",
      pro: "bg-purple-100 text-purple-700",
      enterprise: "bg-emerald-100 text-emerald-700",
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[tier as keyof typeof styles]}`}>{tier}</span>;
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        <DashboardHeader />

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
              <h1 className="text-3xl font-bold text-slate-900">API Keys</h1>
              <p className="text-slate-600 mt-1">Manage your API keys for programmatic access to MultiLLM</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2"
            >
              <Key className="w-5 h-5" />
              Generate New Key
            </button>
          </motion.div>

          {/* Newly created key banner (shown once) */}
          {revealedKey && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-6 bg-purple-50 border-2 border-purple-200 rounded-2xl"
            >
              <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-purple-600" />
                Copy this key now - it won't be shown again
              </h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-4 py-2 bg-white rounded-lg font-mono text-sm border border-slate-200 overflow-x-auto">
                  {revealedKey}
                </code>
                <button
                  onClick={() => copyToClipboard(revealedKey)}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors flex items-center gap-1"
                >
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={() => setRevealedKey(null)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          )}

          {/* API Keys List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
          >
            {loading ? (
              <div className="p-12 text-center text-slate-500">Loading...</div>
            ) : keys.length === 0 ? (
              <div className="p-12 text-center">
                <Key className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">No API keys yet</h3>
                <p className="text-slate-500 mb-6">Create your first API key to start integrating MultiLLM into your applications</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors inline-flex items-center gap-2"
                >
                  <Key className="w-5 h-5" />
                  Generate API Key
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {keys.map((key) => (
                  <motion.div
                    key={key.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="p-6 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={`p-3 rounded-xl ${key.tier === "enterprise" ? "bg-emerald-100" : key.tier === "pro" ? "bg-purple-100" : "bg-slate-100"}`}>
                        <Key className={`w-6 h-6 ${key.tier === "enterprise" ? "text-emerald-600" : key.tier === "pro" ? "text-purple-600" : "text-slate-600"}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-slate-900 truncate">{key.name}</h3>
                          {getTierBadge(key.tier)}
                        </div>
                        <p className="text-sm text-slate-500 font-mono truncate max-w-xs">
                          {key.key_prefix}••••••••••••••••••••
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 sm:gap-8 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <Shield className="w-4 h-4" />
                        <span>{key.usage_count.toLocaleString()} calls</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>Created {formatDate(key.created_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:ml-auto">
                      <button
                        onClick={() => deleteKey(key.id)}
                        className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                        title="Delete Key"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Rate Limits Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-8 p-6 bg-slate-50 rounded-2xl"
          >
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              Using Your Key
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600">
              <div className="bg-white p-4 rounded-xl">
                <h4 className="font-medium text-slate-900 mb-2">Request</h4>
                <pre className="text-xs bg-slate-100 p-3 rounded overflow-x-auto">
{`POST /api/query
Authorization: Bearer mllm_pro_xxx...
Content-Type: application/json

{ "prompt": "..." }`}
                </pre>
              </div>
              <div className="bg-white p-4 rounded-xl">
                <h4 className="font-medium text-slate-900 mb-2">Security</h4>
                <ul className="space-y-1">
                  <li>• Keys are shown only once</li>
                  <li>• Delete and re-create a key if it leaks</li>
                  <li>• Use environment variables in production, never commit keys</li>
                </ul>
              </div>
            </div>
          </motion.div>
        </main>

        {/* Create Key Modal */}
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
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Generate New API Key</h2>
              <p className="text-slate-600 mb-6">Give your key a name and select the tier. The key will only be shown once.</p>

              <div className="space-y-4 mb-6">
                <div>
                  <label htmlFor="keyName" className="block text-sm font-medium text-slate-700 mb-1">
                    Key Name
                  </label>
                  <input
                    id="keyName"
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., Production API, Mobile App, CI/CD"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tier</label>
                  <div className="grid grid-cols-3 gap-2">
                    {["free", "pro", "enterprise"].map((tier) => (
                      <button
                        key={tier}
                        onClick={() => setNewKeyTier(tier as "free" | "pro" | "enterprise")}
                        className={`p-3 rounded-xl text-center text-sm font-medium border-2 transition-colors ${
                          newKeyTier === tier
                            ? "border-purple-500 bg-purple-50 text-purple-700"
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                        }`}
                        disabled={user?.profile?.plan === "free" && tier !== "free"}
                      >
                        <div className="font-semibold capitalize">{tier}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {tier === "free" ? "10/min" : tier === "pro" ? "100/min" : "1000/min"}
                        </div>
                      </button>
                    ))}
                  </div>
                  {user?.profile?.plan === "free" && newKeyTier !== "free" && (
                    <p className="text-xs text-red-500 mt-1">Upgrade to Pro to use Pro/Enterprise keys</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateKey}
                  className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors"
                >
                  Generate Key
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </ProtectedRoute>
  );
}
