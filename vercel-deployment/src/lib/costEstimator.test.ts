import { describe, it, expect } from "vitest";
import { estimateTokens, estimateQueryCost, formatCostEstimate } from "./costEstimator";

describe("estimateTokens", () => {
  it("is zero for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates roughly 4 characters per token, minimum 1", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });
});

describe("estimateQueryCost", () => {
  it("is free and single-provider when local-only is on, regardless of prompt", () => {
    const estimate = estimateQueryCost("Write a python function", ["openai", "gemini"], true);
    expect(estimate.totalUsd).toBe(0);
    expect(estimate.providerCount).toBe(1);
    expect(estimate.localOnly).toBe(true);
  });

  it("narrows to the category's recommended providers when available", () => {
    const estimate = estimateQueryCost("Write a python function that raises an exception", ["openai", "gemini", "mistral", "groq"], false);
    expect(estimate.category).toBe("code");
    expect(estimate.providerCount).toBeLessThan(4);
    expect(estimate.totalUsd).toBeGreaterThan(0);
  });

  it("falls back to the available pool when none of the recommended providers are available", () => {
    const estimate = estimateQueryCost("Write a python function", ["mistral"], false);
    expect(estimate.providerCount).toBe(1);
    expect(estimate.perProvider[0].label).toMatch(/Mistral/);
  });

  it("scales cost with prompt length", () => {
    const short = estimateQueryCost("hi", ["openai"], false);
    const long = estimateQueryCost("hi ".repeat(500), ["openai"], false);
    expect(long.totalUsd).toBeGreaterThan(short.totalUsd);
  });
});

describe("formatCostEstimate", () => {
  it("reads as a no-cost message for local-only", () => {
    const estimate = estimateQueryCost("hello", null, true);
    expect(formatCostEstimate(estimate)).toBe("Local mode: no API cost");
  });

  it("reads as '~$X across N models' otherwise", () => {
    const estimate = estimateQueryCost("Explain quantum computing", ["openai", "gemini"], false);
    expect(formatCostEstimate(estimate)).toMatch(/^(~\$|<\$)/);
    expect(formatCostEstimate(estimate)).toMatch(/models?$/);
  });
});
