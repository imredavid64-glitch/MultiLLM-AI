"use client";

import Link from "next/link";

export default function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-emerald-600">MultiLLM</span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/" className="text-slate-700 hover:text-emerald-600 font-medium">
            Home
          </Link>
          <Link href="/dashboard" className="text-slate-700 hover:text-emerald-600 font-medium">
            Dashboard
          </Link>
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
            Sign In
          </button>
        </nav>
      </div>
    </header>
  );
}
