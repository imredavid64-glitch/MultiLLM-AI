"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Key, Copy, Trash2, Eye, EyeOff, Shield, Clock, AlertCircle, CheckCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { toast } from "react-hot-toast";

const mockApiKeys = [
  {
    id: "key_1",
    name: "Production API",
    prefix: "mllm_prod_",
    key: "mllm_prod_abc123def456ghi789jkl012",
    tier: "pro",
    rateLimit: 100,
    monthlyUsage: 2847,
    lastUsed: "2024-01-15T10:30:00Z",
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "key_2",
    name: "Development",
    prefix: "mllm_dev_",
    key: "mllm_dev_xyz789uvw456rst123qwe456",
    tier: "free",
    rateLimit: 10,
    monthlyUsage: 156,
    lastUsed: "2024-01-14T15:22:00Z",
    createdAt: "2024-01-10T00:00:00Z",
  },
];

export default function ApiKeysPage() {
  const { user } = useAuth();
  const [keys, setKeys] = useState(mockApiKeys);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyTier, setNewKeyTier] = useState<"free" | "pro" | "enterprise">(user?.prefs?.subscriptionTier as "free" | "pro" | "enterprise" || "free");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<string | null>(null);

  const generateKey = (tier: string) => {
    const prefix = tier === "enterprise" ? "mllm_ent_" : tier === "pro" ? "mllm_pro_" : "mllm_dev_";
    const randomPart = Array.from({ length: 32 }, () => Math.random().toString(36).charAt(2)).join("");
    return `${prefix}${randomPart}`;
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) {
      toast.error("Please enter a name for your API key");
      return;
    }

    const tierLimits = { free: 10, pro: 100, enterprise: 1000 };
    const newKey = {
      id: `key_${Date.now()}`,
      name: newKeyName,
      prefix: newKeyTier === "enterprise" ? "mllm_ent_" : newKeyTier === "pro" ? "mllm_pro_" : "mllm_dev_",
      key: generateKey(newKeyTier),
      tier: newKeyTier,
      rateLimit: tierLimits[newKeyTier],
      monthlyUsage: 0,
      lastUsed: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    setKeys([newKey, ...keys]);
    setShowCreateModal(false);
    setNewKeyName("");
    setCopiedKey(newKey.key);
    toast.success("API key created! Save it now - you won't see it again.");
  };

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 3000);
    toast.success("Copied to clipboard!");
  };

  const deleteKey = (id: string) => {
    if (confirm("Are you sure you want to delete this API key? This cannot be undone.")) {
      setKeys(keys.filter((k) => k.id !== id));
      toast.success("API key deleted");
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
                  <a href="/dashboard/api-keys" className="text-purple-600 font-medium">API Keys</a>
                  <a href="/dashboard/training" className="text-slate-700 hover:text-purple-600 font-medium">Training</a>
                  <a href="/dashboard/analytics" className="text-slate-700 hover:text-purple-600 font-medium">Analytics</a>
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

          {/* API Keys List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
          >
            {keys.length === 0 ? (
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
                          {copiedKey === key.key ? "••••••••••••••••••••••••••••••••" : `${key.prefix}••••••••••••••••••••`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 sm:gap-8 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <Shield className="w-4 h-4" />
                        <span>{key.rateLimit}/min</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{key.monthlyUsage.toLocaleString()}/month</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        <span>Created {formatDate(key.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:ml-auto">
                      <button
                        onClick={() => setShowKey(showKey === key.key ? null : key.key)}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                        title="Show/Hide Key"
                      >
                        {showKey === key.key ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                      {showKey === key.key && (
                        <div className="relative">
                          <button
                            onClick={() => copyToClipboard(key.key)}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors flex items-center gap-1"
                          >
                            {copiedKey === key.key ? (
                              <>
                                <CheckCircle className="w-4 h-4" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                      )}
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
              Rate Limits & Best Practices
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-600">
              <div className="bg-white p-4 rounded-xl">
                <h4 className="font-medium text-slate-900 mb-2">Rate Limits</h4>
                <ul className="space-y-1">
                  <li>• Free: 10 requests/minute</li>
                  <li>• Pro: 100 requests/minute</li>
                  <li>• Enterprise: 1,000 requests/minute</li>
                </ul>
              </div>
              <div className="bg-white p-4 rounded-xl">
                <h4 className="font-medium text-slate-900 mb-2">Headers</h4>
                <pre className="text-xs bg-slate-100 p-3 rounded overflow-x-auto">
{`Authorization: Bearer mllm_pro_xxx...
Content-Type: application/json`}
                </pre>
              </div>
              <div className="bg-white p-4 rounded-xl">
                <h4 className="font-medium text-slate-900 mb-2">Security</h4>
                <ul className="space-y-1">
                  <li>• Keys shown only once</li>
                  <li>• Rotate keys regularly</li>
                  <li>• Use env variables in production</li>
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
                        disabled={user?.prefs?.subscriptionTier === "free" && tier !== "free"}
                      >
                        <div className="font-semibold capitalize">{tier}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {tier === "free" ? "10/min" : tier === "pro" ? "100/min" : "1000/min"}
                        </div>
                      </button>
                    ))}
                  </div>
                  {user?.prefs?.subscriptionTier === "free" && newKeyTier !== "free" && (
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