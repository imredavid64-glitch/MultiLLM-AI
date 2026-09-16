import { NextRequest, NextResponse } from "next/server";
import { getQueries, getQueryStats } from "@/lib/supabase/services";
import { getAuthenticatedUserId } from "@/lib/supabase/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [rows, stats] = await Promise.all([
    getQueries(userId, 500, 0),
    getQueryStats(userId),
  ]);

  const byDay = new Map<string, { queries: number; accuracySum: number; carbonSaved: number }>();
  const byProvider = new Map<string, { count: number; accuracySum: number; latencySum: number; carbonSum: number }>();
  const byHour = new Array(24).fill(0);

  for (const row of rows) {
    const created = new Date(row.created_at);
    const dayKey = created.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const day = byDay.get(dayKey) || { queries: 0, accuracySum: 0, carbonSaved: 0 };
    day.queries += 1;
    day.accuracySum += row.confidence_score;
    day.carbonSaved += row.carbon_saved;
    byDay.set(dayKey, day);

    const provider = row.top_provider || "MultiLLM";
    const p = byProvider.get(provider) || { count: 0, accuracySum: 0, latencySum: 0, carbonSum: 0 };
    p.count += 1;
    p.accuracySum += row.confidence_score;
    p.latencySum += row.latency_ms;
    p.carbonSum += row.carbon_saved;
    byProvider.set(provider, p);

    byHour[created.getHours()] += 1;
  }

  const overview = Array.from(byDay.entries())
    .map(([name, d]) => ({
      name,
      queries: d.queries,
      accuracy: d.queries ? Number(((d.accuracySum / d.queries) * 100).toFixed(1)) : 0,
      carbonSaved: Number(d.carbonSaved.toFixed(1)),
    }))
    .reverse();

  const modelPerformance = Array.from(byProvider.entries()).map(([model, p]) => ({
    model,
    accuracy: p.count ? Number(((p.accuracySum / p.count) * 100).toFixed(1)) : 0,
    latency: p.count ? Number((p.latencySum / p.count / 1000).toFixed(2)) : 0,
    carbonPerQuery: p.count ? Number((p.carbonSum / p.count).toFixed(3)) : 0,
  }));

  const providerColors = ["#8b5cf6", "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#6b7280"];
  const usageByProvider = Array.from(byProvider.entries()).map(([name, p], i) => ({
    name,
    value: rows.length ? Number(((p.count / rows.length) * 100).toFixed(1)) : 0,
    color: providerColors[i % providerColors.length],
  }));

  const hourlyData = byHour.map((queries, hour) => ({
    hour: `${hour.toString().padStart(2, "0")}:00`,
    queries,
  }));

  const avgAccuracy = rows.length
    ? Number(((rows.reduce((a, r) => a + r.confidence_score, 0) / rows.length) * 100).toFixed(1))
    : 0;

  return NextResponse.json({
    overview,
    modelPerformance,
    usageByProvider,
    hourlyData,
    totals: {
      totalQueries: stats.totalQueries,
      avgAccuracy,
      totalCarbonSaved: Number(stats.totalCarbonSaved.toFixed(1)),
      avgLatencyMs: Number(stats.avgLatency.toFixed(0)),
    },
  });
}
