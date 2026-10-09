// Feature 3 (pre-send cost estimator): static, approximate public per-1K-token
// pricing, blended input+output into one rate since this only needs to
// produce a "~$0.004 across 3 models" ballpark before sending, not an exact
// bill -- the real per-query token accounting happens server-side (see
// vercel-deployment/api/query-ensemble/main.py's CARBON_G_PER_1K_TOKENS-style
// estimate, and token_optimizer.py for what's actually measured).
//
// TODO(david): figures are rough, as-of-writing public list prices for each
// provider's default model (ai_client.py's DEFAULT_*_MODEL), not live-metered
// and not pinned to a specific pricing-page date. Revisit if a provider's
// pricing changes materially, or if this ever needs to be billed on rather
// than just estimated.

export type ProviderFamily = "openai" | "gemini" | "mistral" | "groq" | "local";

export interface ProviderPriceEntry {
  label: string;
  blendedPer1kUsd: number;
}

export const PROVIDER_PRICING: Record<ProviderFamily, ProviderPriceEntry> = {
  openai: { label: "OpenAI (gpt-4o-mini)", blendedPer1kUsd: 0.00035 },
  gemini: { label: "Google Gemini (2.5 Flash)", blendedPer1kUsd: 0.00019 },
  mistral: { label: "Mistral (small)", blendedPer1kUsd: 0.0004 },
  groq: { label: "Groq (OSS 120B)", blendedPer1kUsd: 0.00015 },
  local: { label: "Local TinyGPT", blendedPer1kUsd: 0 },
};
