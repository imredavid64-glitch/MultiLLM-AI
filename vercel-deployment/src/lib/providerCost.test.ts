import { describe, it, expect } from "vitest";
import { estimateTokens, estimateQueryCostUsd, getProviderPrice } from "./providerCost";

describe("estimateTokens", () => {
  it("is zero for empty/missing text", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  it("estimates roughly 4 characters per token, minimum 1", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });
});

describe("getProviderPrice", () => {
  it("returns a zero-cost price for the local model", () => {
    const price = getProviderPrice("Local TinyGPT (from scratch)");
    expect(price.inputPer1k).toBe(0);
    expect(price.outputPer1k).toBe(0);
  });

  it("falls back to a non-zero default for an unknown provider", () => {
    const price = getProviderPrice("Some New Provider");
    expect(price.inputPer1k).toBeGreaterThan(0);
    expect(price.outputPer1k).toBeGreaterThan(0);
  });
});

describe("estimateQueryCostUsd", () => {
  it("is zero when every candidate came from the free local model", () => {
    const cost = estimateQueryCostUsd({
      prompt: "hello",
      candidates: [{ provider_name: "Local TinyGPT (from scratch)", text: "a response" }],
      finalAnswer: "a response",
    });
    expect(cost).toBe(0);
  });

  it("is positive once a paid provider is involved", () => {
    const cost = estimateQueryCostUsd({
      prompt: "Explain quantum computing in simple terms",
      candidates: [{ provider_name: "Google Gemini", text: "Quantum computing uses qubits...".repeat(10) }],
      finalAnswer: "Quantum computing uses qubits...".repeat(10),
    });
    expect(cost).toBeGreaterThan(0);
  });

  it("sums cost across multiple candidates plus the synthesis call", () => {
    const oneCandidate = estimateQueryCostUsd({
      prompt: "test prompt",
      candidates: [{ provider_name: "Mistral", text: "answer text here" }],
      finalAnswer: "answer text here",
    });
    const twoCandidates = estimateQueryCostUsd({
      prompt: "test prompt",
      candidates: [
        { provider_name: "Mistral", text: "answer text here" },
        { provider_name: "Mistral", text: "another answer text" },
      ],
      finalAnswer: "answer text here",
    });
    expect(twoCandidates).toBeGreaterThan(oneCandidate);
  });

  it("returns 0 for no candidates and an empty final answer", () => {
    expect(estimateQueryCostUsd({ prompt: "x", candidates: [], finalAnswer: "" })).toBe(0);
  });
});
