"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-4">
      <p className="text-sm font-semibold text-purple-600 mb-2">Error</p>
      <h1 className="text-3xl font-bold text-slate-900 mb-3">Something went wrong</h1>
      <p className="text-slate-600 max-w-md mb-8">
        An unexpected error occurred. Try again, or head back to the homepage.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
