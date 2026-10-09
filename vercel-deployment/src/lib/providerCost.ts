// Single source of truth for ESTIMATED, server-recorded per-query provider
// cost (written to queries.estimated_cost_usd and used by the daily spend
// cap -- see src/lib/spendCap.ts and src/app/api/query/route.ts).
//
// Deliberately a separate module from src/lib/providerPricing.ts, which is
// the pre-send client-side ballpark estimate shown before a query is even
// sent (blended per-1k rate, by provider family). This module instead prices
// each candidate actually returned by the ensemble, by the exact provider
// name ai_client.py used for it, and is what actually gets persisted/summed
// for the spend cap -- the two are allowed to use different rates/shapes
// since they answer different questions ("roughly what would this cost?"
// before sending vs. "what did this actually cost?" after the fact).
//
// Prices are USD per 1,000 tokens, manually maintained from each provider's
// public pricing page -- not fetched live, so revisit these if a provider
// reprices. Token counts are a cheap ~4-chars/token estimate, the same
// heuristic token_optimizer.estimate_tokens uses on the Python side -- good
// enough to compare relative cost and warn before a spend cap is hit, not
// meant to match a provider's exact billed token count. Provider name
// strings match ai_client.py's ChatProvider.name exactly (see
// format_provider_status/candidate.provider_name).
export interface TokenPrice {
  inputPer1k: number;
  outputPer1k: number;
}

export const PROVIDER_PRICE_PER_1K_TOKENS: Record<string, TokenPrice> = {
  "OpenAI-compatible": { inputPer1k: 0.00015, outputPer1k: 0.0006 }, // gpt-4o-mini
  "OpenRouter (OpenAI API)": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "Groq (OpenAI API)": { inputPer1k: 0.0001, outputPer1k: 0.0001 }, // open-weight models, Groq pricing
  "Google Gemini": { inputPer1k: 0.000075, outputPer1k: 0.0003 }, // gemini-2.5-flash
  Mistral: { inputPer1k: 0.0001, outputPer1k: 0.0003 }, // mistral-small-latest
  "Local TinyGPT (from scratch)": { inputPer1k: 0, outputPer1k: 0 }, // no API cost
};

// Used for any provider name not in the table above (e.g. a new provider
// added to ai_client.py before this table is updated) -- a conservative
// non-zero default so a query never gets silently costed at $0.
const DEFAULT_PRICE: TokenPrice = { inputPer1k: 0.00015, outputPer1k: 0.0006 };

export function getProviderPrice(providerName: string): TokenPrice {
  return PROVIDER_PRICE_PER_1K_TOKENS[providerName] ?? DEFAULT_PRICE;
}

export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.max(1, Math.floor(text.length / 4));
}

export interface CandidateForCost {
  provider_name: string;
  text: string;
}

/**
 * Rough estimated cost (USD) for one ensemble query: one call's worth of
 * input+output tokens per candidate bot, plus one more input+output charge
 * for the synthesis/judge call that produced `finalAnswer` (billed to the
 * top-scoring candidate's provider, since that's the provider
 * build_ensemble_answer actually used for synthesis in the common case).
 * Deliberately approximate -- see module comment above.
 */
export function estimateQueryCostUsd(params: {
  prompt: string;
  candidates: CandidateForCost[];
  finalAnswer: string;
}): number {
  const promptTokens = estimateTokens(params.prompt);
  let totalUsd = 0;

  for (const candidate of params.candidates) {
    const price = getProviderPrice(candidate.provider_name);
    const outputTokens = estimateTokens(candidate.text);
    totalUsd += (promptTokens / 1000) * price.inputPer1k + (outputTokens / 1000) * price.outputPer1k;
  }

  const topProviderName = params.candidates[0]?.provider_name;
  if (topProviderName) {
    const price = getProviderPrice(topProviderName);
    const answerTokens = estimateTokens(params.finalAnswer);
    totalUsd += (promptTokens / 1000) * price.inputPer1k + (answerTokens / 1000) * price.outputPer1k;
  }

  // Sub-cent precision (6 decimal places) -- round rather than truncate so
  // many small queries don't silently lose money to floor() each time.
  return Math.round(totalUsd * 1e6) / 1e6;
}
