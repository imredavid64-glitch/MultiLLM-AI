// Feature 3: pre-send cost estimate. Entirely client-computable (no network
// call per keystroke) -- the one network call it depends on
// (GET /api/query's available-models list) is fetched once per page load by
// the caller, not per estimate.
import { PROVIDER_PRICING, type ProviderFamily } from "./providerPricing";
import { classifyPromptClient } from "./promptRouting";

const CHARS_PER_TOKEN = 4;

// Rough assumed response length per bot call used only for this estimate --
// this is a ballpark shown before sending, not a precise bill. The real
// per-query token accounting happens server-side (token_optimizer.py).
const ASSUMED_RESPONSE_TOKENS = 300;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

export interface CostEstimate {
  totalUsd: number;
  providerCount: number;
  category: string;
  perProvider: { label: string; usd: number }[];
  localOnly: boolean;
}

export function estimateQueryCost(
  prompt: string,
  availableProviders: ProviderFamily[] | null,
  localOnly: boolean
): CostEstimate {
  if (localOnly) {
    return {
      totalUsd: 0,
      providerCount: 1,
      category: "local",
      perProvider: [{ label: PROVIDER_PRICING.local.label, usd: 0 }],
      localOnly: true,
    };
  }

  const promptTokens = estimateTokens(prompt);
  const { category, providers: recommended } = classifyPromptClient(prompt);
  const pool = availableProviders && availableProviders.length ? availableProviders : (["openai", "gemini", "mistral", "groq"] as ProviderFamily[]);
  const chosen = recommended.filter((p) => pool.includes(p));
  const providers = chosen.length ? chosen : pool;

  const perProvider = providers.map((key) => {
    const entry = PROVIDER_PRICING[key];
    const tokens = promptTokens + ASSUMED_RESPONSE_TOKENS;
    return { label: entry.label, usd: (tokens / 1000) * entry.blendedPer1kUsd };
  });
  const totalUsd = perProvider.reduce((sum, p) => sum + p.usd, 0);

  return { totalUsd, providerCount: providers.length, category, perProvider, localOnly: false };
}

export function formatCostEstimate(estimate: CostEstimate): string {
  if (estimate.localOnly) {
    return "Local mode: no API cost";
  }
  if (!estimate.providerCount) {
    return "";
  }
  const amount = estimate.totalUsd < 0.001 ? "<$0.001" : `~$${estimate.totalUsd.toFixed(estimate.totalUsd < 0.01 ? 4 : 3)}`;
  const modelWord = estimate.providerCount === 1 ? "model" : "models";
  return `${amount} across ${estimate.providerCount} ${modelWord}`;
}
