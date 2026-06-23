import { describe, it, expect } from "vitest";
import * as root from "../src";
import * as client from "../src/client";
import * as server from "../src/server";
import * as hono from "../src/server/hono";
import * as redis from "../src/server/redis";
import * as memory from "../src/server/memory";
import * as shared from "../src/shared";

describe("public entry points", () => {
  it("exposes the client API", () => {
    expect(typeof client.TrpcLiveProvider).toBe("function");
    expect(typeof client.useTrpcLiveStatus).toBe("function");
    expect(typeof client.createTrpcLiveClient).toBe("function");
    expect(typeof client.resolveTrpcPath).toBe("function");
    expect(typeof client.invalidateTarget).toBe("function");
  });

  it("exposes the server API", () => {
    expect(typeof server.createLiveInvalidationProxy).toBe("function");
    expect(typeof server.createTrpcLiveServer).toBe("function");
    expect(typeof server.createInvalidationEvent).toBe("function");
    expect(server.TRPC_LIVE_EVENT_TYPE).toBe("trpc.invalidate");
  });

  it("exposes the adapters", () => {
    expect(typeof hono.honoTrpcLiveAdapter).toBe("function");
    expect(typeof redis.createRedisPubSub).toBe("function");
    expect(typeof memory.createMemoryPubSub).toBe("function");
  });

  it("exposes shared constants from the root and shared entry", () => {
    expect(shared.TRPC_LIVE_EVENT_TYPE).toBe("trpc.invalidate");
    expect(shared.DEFAULT_PUBSUB_CHANNEL).toBe("trpc-live:invalidations");
    expect(root.TRPC_LIVE_EVENT_TYPE).toBe("trpc.invalidate");
    expect(typeof shared.createEventId).toBe("function");
  });
});
