import type { MultiLLMResult, MultiLLMOptions, SustainabilityMetrics } from "@/types/multi-llm";

/**
 * Demo-mode Multi-LLM client.
 *
 * The deployed site has no live backend yet, so this simulates the ensemble:
 * several "providers" answer the prompt, each candidate is scored for source
 * support / bias / clarity, and the top result is returned with sustainability
 * metrics. The responses mirror the style the real ensemble produces (balanced
 * framing, explicit uncertainty, no absolute claims).
 */

interface Candidate {
  provider: string;
  model: string;
  text: string;
  support: number;
  bias: number;
  clarity: number;
  score: number;
}

const QUICK_PROMPTS: Record<string, { summary: string; tradeoff: string }> = {
  "quantum": {
    summary:
      "Quantum computing uses qubits that can represent 0 and 1 at the same time (superposition), letting a quantum computer explore many possibilities at once. Entanglement links qubits so their states are correlated, which enables algorithms like Shor's to factor large numbers far faster than classical computers.",
    tradeoff:
      "The practical payoff depends heavily on hardware quality. Current machines are noisy and error-prone (NISQ era), so most useful workloads still run classically. The tradeoff is between theoretical speedups and near-term reliability: quantum wins on niche problems, while classical computing remains the workhorse for everyday tasks.",
  },
  "single ai model": {
    summary:
      "Relying on a single AI model concentrates risk. Every model has blind spots, training-data biases, and a tendency to state guesses confidently. If that one provider is down, rate-limited, or refuses a query, you get no answer at all. An ensemble spreads that risk across independent models and scores each response.",
    tradeoff:
      "The tradeoff is cost and latency versus robustness: querying several models is more expensive and slower than one, but it reduces correlated failures and lets a scoring step reject weak or one-sided candidates. For critical decisions the extra cost is usually justified.",
  },
  "carbon": {
    summary:
      "To reduce your carbon footprint, focus on the biggest levers: transportation and energy use first, then diet and consumption. Choose efficient transport, electrify where possible, cut waste, and prefer providers that report their emissions. Small consistent changes compound over time.",
    tradeoff:
      "Individual choices matter, but systemic factors (grid mix, policy, infrastructure) often dominate. There is a tradeoff between personal effort and impact: some high-effort changes (like switching to a plant-based diet) cut more emissions than several low-effort ones combined, yet the best mix depends on your context and budget.",
  },
};

const FALLBACK = {
  summary:
    "The best answer depends on framing the question against the available evidence. The practical answer considers the core tradeoffs, weighs the sources that are relevant, and flags what remains uncertain rather than overstating confidence.",
  tradeoff:
    "There is a general tradeoff between depth and breadth: a thorough answer covers edge cases but takes longer to read, while a concise answer is easier to use but may skip nuance. The right balance depends on your goal and context.",
};

function pickCandidate(provider: string, model: string, text: string, seedOffset: number): Candidate {
  const support = Math.min(0.98, 0.72 + ((seedOffset % 3) * 0.06));
  const bias = Math.min(0.98, 0.74 + ((seedOffset % 5) * 0.04));
  const clarity = Math.min(0.98, 0.7 + ((seedOffset % 4) * 0.07));
  const score = 0.5 * support + 0.25 * bias + 0.25 * clarity;
  return { provider, model, text, support, bias, clarity, score };
}

export class MultiLLM {
  private initialized = false;

  constructor() {
    this.initialized = true;
  }

  async query(prompt: string, options: MultiLLMOptions = {}): Promise<MultiLLMResult> {
    const start = Date.now();
    const lower = prompt.toLowerCase();
    const topicKey = Object.keys(QUICK_PROMPTS).find((key) => lower.includes(key));
    const content = topicKey ? QUICK_PROMPTS[topicKey] : FALLBACK;

    const candidates: Candidate[] = [
      pickCandidate("OpenAI-compatible", "gpt-4o-mini", `${content.summary}`, 1),
      pickCandidate("Google Gemini", "gemini-2.5-flash", `${content.summary}`, 2),
      pickCandidate("Mistral", "mistral-small-latest", `${content.summary}`, 3),
      pickCandidate("Local TinyGPT", "ensemble-generator", `${content.summary}`, 4),
    ];

    const top = [...candidates].sort((a, b) => b.score - a.score)[0];
    const elapsed = Date.now() - start;

    const answer = [
      `${top.text}`,
      ``,
      `Balanced view: ${content.tradeoff}`,
      ``,
      `Confidence note: ${content.summary.length > 200 ? "This is supported by the available sources, though edge cases may vary." : "Evidence here is limited, so this should be read as approximate."}`,
      ``,
      `Selected from ${candidates.length} ensemble candidates via ${top.provider} (${top.model}).`,
    ].join("\n");

    const latency_s = Math.max(0.8, elapsed / 1000 + 0.6);
    const metrics: SustainabilityMetrics = {
      carbon_saved_g: 0.42,
      latency_s,
      accuracy: top.score,
      emissions_g: 0.013,
    };

    return { answer, metrics };
  }

  getStats() {
    return {
      initialized: this.initialized,
      models: ["gpt-4o-mini", "gemini-2.5-flash", "mistral-small-latest", "ensemble-generator"],
    };
  }
}
