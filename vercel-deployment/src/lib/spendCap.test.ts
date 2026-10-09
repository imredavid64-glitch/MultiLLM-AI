import { describe, it, expect, afterEach } from "vitest";
import { evaluateSpendCap, getDailySpendCapUsd } from "./spendCap";

describe("evaluateSpendCap", () => {
  it("is disabled when capUsd is null", () => {
    const status = evaluateSpendCap(1_000_000, null);
    expect(status.blocked).toBe(false);
    expect(status.warn).toBe(false);
    expect(status.capUsd).toBeNull();
  });

  it("is disabled when capUsd is zero or negative", () => {
    expect(evaluateSpendCap(100, 0).blocked).toBe(false);
    expect(evaluateSpendCap(100, -5).blocked).toBe(false);
  });

  it("allows spend well under the warn threshold", () => {
    const status = evaluateSpendCap(10, 100);
    expect(status.blocked).toBe(false);
    expect(status.warn).toBe(false);
  });

  it("warns at exactly 80% of the cap but does not block", () => {
    const status = evaluateSpendCap(80, 100);
    expect(status.blocked).toBe(false);
    expect(status.warn).toBe(true);
  });

  it("blocks at exactly 100% of the cap", () => {
    const status = evaluateSpendCap(100, 100);
    expect(status.blocked).toBe(true);
    expect(status.warn).toBe(true);
  });

  it("blocks when spend exceeds the cap", () => {
    const status = evaluateSpendCap(150, 100);
    expect(status.blocked).toBe(true);
  });
});

describe("getDailySpendCapUsd", () => {
  const ORIGINAL = process.env.DAILY_PROVIDER_SPEND_CAP_USD;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.DAILY_PROVIDER_SPEND_CAP_USD;
    else process.env.DAILY_PROVIDER_SPEND_CAP_USD = ORIGINAL;
  });

  it("is disabled (null) when unset", () => {
    delete process.env.DAILY_PROVIDER_SPEND_CAP_USD;
    expect(getDailySpendCapUsd()).toBeNull();
  });

  it("parses a positive numeric value", () => {
    process.env.DAILY_PROVIDER_SPEND_CAP_USD = "25.5";
    expect(getDailySpendCapUsd()).toBe(25.5);
  });

  it("is disabled (null) for a non-numeric or non-positive value", () => {
    process.env.DAILY_PROVIDER_SPEND_CAP_USD = "not-a-number";
    expect(getDailySpendCapUsd()).toBeNull();
    process.env.DAILY_PROVIDER_SPEND_CAP_USD = "0";
    expect(getDailySpendCapUsd()).toBeNull();
    process.env.DAILY_PROVIDER_SPEND_CAP_USD = "-10";
    expect(getDailySpendCapUsd()).toBeNull();
  });
});
