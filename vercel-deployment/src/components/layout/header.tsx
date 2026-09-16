"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export default function Header() {
  const pathname = usePathname();
  const { user, demoMode } = useAuth();

  if (pathname.startsWith("/dashboard")) {
    return null;
  }

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-purple-600">MultiLLM</span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/" className="text-slate-700 hover:text-purple-600 font-medium">
            Home
          </Link>
          <Link href="/dashboard" className="text-slate-700 hover:text-purple-600 font-medium">
            Dashboard
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Sign In
            </Link>
          )}
          {demoMode && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Demo
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
