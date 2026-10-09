import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// Shared markup for "no data yet" states, matching the pattern already
// hand-rolled in dashboard/api-keys and dashboard/projects (icon + heading +
// description + optional CTA inside a centered p-12 card).
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="p-12 text-center">
      <Icon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
      <h3 className="text-xl font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-500 mb-6">{description}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors inline-flex items-center gap-2"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
