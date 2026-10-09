import { describe, it, expect, vi } from "vitest";
import { consumeEnsembleStream } from "./consumeSseStream";

function sseStream(events: Record<string, unknown>[]): ReadableStream<Uint8Array> {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const bytes = new TextEncoder().encode(body);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe("consumeEnsembleStream", () => {
  it("dispatches status/token/done events and returns the done payload", async () => {
    const onStage = vi.fn();
    const onToken = vi.fn();
    const stream = sseStream([
      { event: "status", stage: "querying_models" },
      { event: "token", text: "Hello" },
      { event: "token", text: ", world" },
      { event: "status", stage: "synthesizing" },
      { event: "done", answer: "Hello, world", metrics: { top_score: 0.9 } },
    ]);

    const result = await consumeEnsembleStream(stream, { onStage, onToken });

    expect(onStage.mock.calls.map((c) => c[0])).toEqual(["querying_models", "synthesizing"]);
    expect(onToken.mock.calls.map((c) => c[0])).toEqual(["Hello", ", world"]);
    expect(result).toEqual({ event: "done", answer: "Hello, world", metrics: { top_score: 0.9 } });
  });

  it("returns null when the stream ends without a done event", async () => {
    const stream = sseStream([{ event: "status", stage: "querying_models" }]);
    const result = await consumeEnsembleStream(stream);
    expect(result).toBeNull();
  });

  it("throws on an explicit error event", async () => {
    const stream = sseStream([{ event: "error", detail: "ensemble exploded" }]);
    await expect(consumeEnsembleStream(stream)).rejects.toThrow("ensemble exploded");
  });

  it("calls onRedacted when the answer gets redacted mid-stream", async () => {
    const onRedacted = vi.fn();
    const stream = sseStream([
      { event: "token", text: "my email is a@b.com" },
      { event: "redacted", text: "my email is [REDACTED:EMAIL]" },
      { event: "done", answer: "my email is [REDACTED:EMAIL]" },
    ]);

    await consumeEnsembleStream(stream, { onRedacted });

    expect(onRedacted).toHaveBeenCalledWith("my email is [REDACTED:EMAIL]");
  });

  it("handles a chunk boundary that splits an SSE event across reads", async () => {
    const payload = `data: ${JSON.stringify({ event: "done", answer: "ok" })}\n\n`;
    const splitAt = Math.floor(payload.length / 2);
    const first = payload.slice(0, splitAt);
    const second = payload.slice(splitAt);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(first));
        controller.enqueue(new TextEncoder().encode(second));
        controller.close();
      },
    });

    const result = await consumeEnsembleStream(stream);
    expect(result?.answer).toBe("ok");
  });
});
