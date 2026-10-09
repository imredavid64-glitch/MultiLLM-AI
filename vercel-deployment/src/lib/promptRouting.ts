// Feature 3's client-side mirror of prompt_router.py's category keywords and
// provider preferences. Deliberately approximate -- it only has to produce a
// reasonable "how many/which providers would this route to" guess for the
// pre-send cost estimate, not match the Python classifier exactly. The real
// routing decision (Feature 1) is always made server-side, on the refined
// prompt, by prompt_router.py.
import type { ProviderFamily } from "./providerPricing";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  code: [
    "code", "function", "bug", "debug", "compile", "exception", "stack trace",
    "refactor", "regex", "python", "javascript", "typescript", "algorithm",
  ],
  math: [
    "calculate", "equation", "solve for", "derivative", "integral", "proof",
    "theorem", "probability", "statistics", "how many", "percentage",
  ],
  creative: [
    "write a story", "write a poem", "poem about", "short story",
    "creative writing", "screenplay", "lyrics", "write a song",
  ],
  factual: [
    "what is", "who is", "when did", "where is", "define", "how does",
    "explain", "history of", "capital of",
  ],
  opinion: [
    "do you think", "your opinion", "which is better", "should i",
    "is it worth", "pros and cons", "recommend",
  ],
};

const CATEGORY_PROVIDERS: Record<string, ProviderFamily[]> = {
  code: ["groq", "openai"],
  math: ["openai", "groq"],
  creative: ["gemini", "mistral"],
  factual: ["openai", "gemini", "mistral", "groq"],
  opinion: ["gemini", "mistral"],
  general: ["openai", "gemini", "mistral", "groq"],
};

export function classifyPromptClient(prompt: string): { category: string; providers: ProviderFamily[] } {
  const text = prompt.toLowerCase();
  let best = "general";
  let bestHits = 0;
  let tie = false;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = keywords.filter((kw) => text.includes(kw)).length;
    if (hits > bestHits) {
      best = category;
      bestHits = hits;
      tie = false;
    } else if (hits > 0 && hits === bestHits) {
      tie = true;
    }
  }

  const category = bestHits === 0 || tie ? "general" : best;
  return { category, providers: CATEGORY_PROVIDERS[category] };
}

/** Parses GET /api/query's `models` list (either the Python ensemble's real
 * provider_status lines or the demo-mode mock's plain model names) into
 * which provider families are actually available to this caller. */
export function parseAvailableProviderFamilies(models: string[]): ProviderFamily[] {
  const text = models.join(" ").toLowerCase();
  const families: ProviderFamily[] = [];
  if (/openai|gpt-|openrouter/.test(text)) families.push("openai");
  if (/gemini/.test(text)) families.push("gemini");
  if (/mistral/.test(text)) families.push("mistral");
  if (/groq/.test(text)) families.push("groq");
  if (/tinygpt|ensemble-generator/.test(text)) families.push("local");
  return families;
}
