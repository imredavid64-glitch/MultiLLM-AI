import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function importFresh() {
  vi.resetModules();
  return await import("./email");
}

describe("sendEmail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("logs instead of sending when RESEND_API_KEY is missing outside production", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    process.env.APP_ENV = "development";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { sendEmail } = await importFresh();
    await sendEmail({ to: "user@example.com", subject: "Hi", text: "Body" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("would-send"));
    vi.unstubAllGlobals();
  });

  it("throws instead of silently dropping the email when the key is missing in production", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    process.env.APP_ENV = "production";

    const { sendEmail } = await importFresh();
    await expect(sendEmail({ to: "user@example.com", subject: "Hi", text: "Body" })).rejects.toThrow();
  });

  it("posts to the Resend API when configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "MultiLLM <hello@example.com>";
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchSpy);

    const { sendEmail } = await importFresh();
    await sendEmail({ to: "user@example.com", subject: "Hi", text: "Body" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toMatchObject({ from: "MultiLLM <hello@example.com>", to: "user@example.com", subject: "Hi" });
    vi.unstubAllGlobals();
  });

  it("throws when Resend returns a non-ok response", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "hello@example.com";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => "bad request" }));

    const { sendEmail } = await importFresh();
    await expect(sendEmail({ to: "user@example.com", subject: "Hi", text: "Body" })).rejects.toThrow(/422/);
    vi.unstubAllGlobals();
  });
});
