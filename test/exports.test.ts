import { describe, it, expect } from "vitest";
import * as root from "../src";
import * as client from "../src/client";
import * as server from "../src/server";
import * as shared from "../src/shared";

describe("public entry points", () => {
  it("exposes the client API (headline: liveLink)", () => {
    expect(typeof client.liveLink).toBe("function");
    expect(typeof client.createLiveOperationLink).toBe("function");
    expect(typeof client.invalidateTarget).toBe("function");
    expect(typeof client.applyInvalidationEvent).toBe("function");
    expect(typeof client.parseInvalidationEvent).toBe("function");
  });

  it("re-exports the client API from the root entry", () => {
    expect(typeof root.liveLink).toBe("function");
    expect(root.DEFAULT_LIVE_PATH).toBe("live.invalidations");
  });

  it("exposes the server API", () => {
    expect(typeof server.createLiveHub).toBe("function");
    expect(typeof server.createLiveProcedure).toBe("function");
    expect(typeof server.liveInvalidations).toBe("function");
    expect(typeof server.createLiveInvalidationProxy).toBe("function");
    expect(server.TRPC_LIVE_EVENT_TYPE).toBe("trpc.invalidate");
    expect(server.DEFAULT_LIVE_PATH).toBe("live.invalidations");
  });

  it("exposes shared constants", () => {
    expect(shared.TRPC_LIVE_EVENT_TYPE).toBe("trpc.invalidate");
    expect(shared.DEFAULT_LIVE_PATH).toBe("live.invalidations");
    expect(typeof shared.createEventId).toBe("function");
  });
});
