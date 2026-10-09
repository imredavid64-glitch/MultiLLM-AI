// Feature 2 (streaming synthesis): reads the SSE body /api/query returns when
// called with `stream: true` (itself a proxy of the Python ensemble's own
// `/api/query/stream`, see api/query-ensemble/main.py) and dispatches each
// event to the caller. Kept framework-agnostic (plain ReadableStream, no
// React) so it's unit-testable without rendering a component.

export interface EnsembleStreamCallbacks {
  onStage?: (stage: string) => void;
  onToken?: (chunk: string) => void;
  onRedacted?: (fullText: string) => void;
}

/**
 * Consumes the stream to completion and returns the final "done" event's
 * payload (answer, metrics, candidates, sources, routing, ...), or null if
 * the stream ended without ever producing one (a dropped connection, or an
 * "error" event from the server -- which this throws for instead).
 */
export async function consumeEnsembleStream(
  body: ReadableStream<Uint8Array>,
  callbacks: EnsembleStreamCallbacks = {}
): Promise<Record<string, any> | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: Record<string, any> | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex;
    while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;

      let event: Record<string, any>;
      try {
        event = JSON.parse(dataLine.slice(5).trim());
      } catch {
        continue;
      }

      switch (event.event) {
        case "status":
          callbacks.onStage?.(event.stage);
          break;
        case "token":
          if (event.text) callbacks.onToken?.(event.text);
          break;
        case "redacted":
          callbacks.onRedacted?.(event.text || "");
          break;
        case "done":
          finalPayload = event;
          break;
        case "error":
          throw new Error(event.detail || "Ensemble stream failed");
        default:
          break;
      }
    }
  }

  return finalPayload;
}
