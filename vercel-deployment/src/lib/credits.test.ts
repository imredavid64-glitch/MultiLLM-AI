import { describe, it, expect } from "vitest";
import { decideCreditReset, PLAN_CREDIT_ALLOWANCES } from "./credits";

const NOW = new Date("2026-10-07T00:00:00Z");

describe("decideCreditReset", () => {
  it("resets after the period started more than a month ago", () => {
    const decision = decideCreditReset({
      plan: "pro",
      creditsPeriodStart: "2026-09-01T00:00:00Z",
      isDemoAccount: false,
      now: NOW,
    });
    expect(decision.shouldReset).toBe(true);
    expect(decision.newAllowance).toBe(PLAN_CREDIT_ALLOWANCES.pro);
  });

  it("does not reset within a month of the period start", () => {
    const decision = decideCreditReset({
      plan: "pro",
      creditsPeriodStart: "2026-09-25T00:00:00Z",
      isDemoAccount: false,
      now: NOW,
    });
    expect(decision.shouldReset).toBe(false);
    expect(decision.newAllowance).toBeUndefined();
  });

  it("never resets a demo/trial account, no matter how old its period is", () => {
    const decision = decideCreditReset({
      plan: "pro",
      creditsPeriodStart: "2020-01-01T00:00:00Z",
      isDemoAccount: true,
      now: NOW,
    });
    expect(decision.shouldReset).toBe(false);
  });

  it("gives each plan its own allowance", () => {
    expect(PLAN_CREDIT_ALLOWANCES.free).toBe(100);
    expect(PLAN_CREDIT_ALLOWANCES.pro).toBe(10000);
    expect(PLAN_CREDIT_ALLOWANCES.enterprise).toBe(100000);
  });
});
