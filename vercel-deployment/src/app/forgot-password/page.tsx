"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Mail } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "react-hot-toast";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { requestPasswordReset, demoMode } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Enter your email address");
      return;
    }
    setIsLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not send reset email";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50 flex items-center justify-center py-12 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <span className="text-3xl font-bold text-purple-600">MultiLLM</span>
          </Link>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Reset your password</h1>
          <p className="text-slate-600">We&apos;ll email you a link to choose a new one</p>
          {demoMode && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Demo mode — password reset requires a real Supabase backend.
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {sent ? (
            <div className="text-center">
              <p className="text-slate-700 mb-6">
                If an account exists for <span className="font-medium">{email}</span>, a password reset link is on
                its way. Check your inbox.
              </p>
              <Link href="/login" className="text-purple-600 hover:text-purple-700 font-medium">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white rounded-xl font-semibold transition-colors"
              >
                {isLoading ? "Sending..." : "Send reset link"}
              </button>

              <p className="text-center text-slate-600">
                <Link href="/login" className="text-purple-600 hover:text-purple-700 font-medium">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
