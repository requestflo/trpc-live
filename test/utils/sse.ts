/** Reads Server-Sent Event frames from a streaming Response body. */
export type FrameReader = {
  /** Next frame (including `:comment` keep-alive frames). */
  next(): Promise<string | null>;
  /** Next frame that carries an `event:` line, skipping comments. */
  nextEvent(): Promise<string | null>;
  cancel(): Promise<void>;
};

export function makeFrameReader(
  stream: ReadableStream<Uint8Array>,
): FrameReader {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  async function next(): Promise<string | null> {
    for (;;) {
      const separator = buffer.indexOf("\n\n");
      if (separator >= 0) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        return frame;
      }
      const { value, done } = await reader.read();
      if (done) {
        if (buffer.length > 0) {
          const frame = buffer;
          buffer = "";
          return frame;
        }
        return null;
      }
      buffer += decoder.decode(value, { stream: true });
    }
  }

  async function nextEvent(): Promise<string | null> {
    for (;;) {
      const frame = await next();
      if (frame === null) return null;
      if (frame.includes("event:")) return frame;
    }
  }

  async function cancel(): Promise<void> {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }

  return { next, nextEvent, cancel };
}
