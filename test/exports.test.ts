import { describe, it, expect } from "vitest";
import * as root from "../src";
import * as client from "../src/client";
import * as shared from "../src/shared";

describe("public entry points", () => {
  it("exposes the client API (headline: liveLink)", () => {
    expect(typeof client.liveLink).toBe("function");
    expect(typeof client.openInvalidationStream).toBe("function");
    expect(typeof client.invalidateTarget).toBe("function");
    expect(typeof client.applyInvalidationEvent).toBe("function");
    expect(typeof client.parseInvalidationEvent).toBe("function");
  });

  it("re-exports the client API from the root entry", () => {
    expect(typeof root.liveLink).toBe("function");
    expect(root.TRPC_LIVE_EVENT_TYPE).toBe("trpc.invalidate");
  });

  it("exposes shared types/constants for building events server-side", () => {
    expect(shared.TRPC_LIVE_EVENT_TYPE).toBe("trpc.invalidate");
    expect(shared.DEFAULT_LIVE_PATH).toBe("live.invalidations");
    expect(typeof shared.createEventId).toBe("function");
  });

  it("does not ship any server helpers", () => {
    expect("createLiveProcedure" in client).toBe(false);
    expect("createLiveHub" in client).toBe(false);
    expect("createLiveInvalidationProxy" in client).toBe(false);
    expect("createLiveProcedure" in root).toBe(false);
  });
});
