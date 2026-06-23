import { describe, it, expect, vi, afterEach } from "vitest";
import { createEventId } from "../../src/shared/ids";

afterEach(() => vi.unstubAllGlobals());

describe("createEventId", () => {
  it("produces a prefixed, unique id using crypto.randomUUID when available", () => {
    const a = createEventId();
    const b = createEventId();
    expect(a.startsWith("evt_")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("falls back to a timestamp + random suffix when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {});
    const id = createEventId();
    expect(id).toMatch(/^evt_[0-9a-z]+_/);
  });

  it("falls back when there is no crypto at all", () => {
    vi.stubGlobal("crypto", undefined);
    const id = createEventId();
    expect(id.startsWith("evt_")).toBe(true);
  });
});
