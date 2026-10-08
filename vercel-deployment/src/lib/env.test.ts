import { describe, it, expect, afterEach } from "vitest";
import { getAppEnv, isProduction } from "./env";

const ORIGINAL_APP_ENV = process.env.APP_ENV;

afterEach(() => {
  if (ORIGINAL_APP_ENV === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = ORIGINAL_APP_ENV;
});

describe("getAppEnv", () => {
  it("returns production only when explicitly set", () => {
    process.env.APP_ENV = "production";
    expect(getAppEnv()).toBe("production");
    expect(isProduction()).toBe(true);
  });

  it("returns staging when set", () => {
    process.env.APP_ENV = "staging";
    expect(getAppEnv()).toBe("staging");
    expect(isProduction()).toBe(false);
  });

  it("defaults to development when unset", () => {
    delete process.env.APP_ENV;
    expect(getAppEnv()).toBe("development");
    expect(isProduction()).toBe(false);
  });

  it("defaults to development for an unrecognized value, not production", () => {
    process.env.APP_ENV = "prod";
    expect(getAppEnv()).toBe("development");
  });

  it("is case-insensitive", () => {
    process.env.APP_ENV = "PRODUCTION";
    expect(getAppEnv()).toBe("production");
  });
});
