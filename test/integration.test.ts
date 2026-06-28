import { describe, it, expect } from "vitest";
import { getQueryKey } from "@trpc/react-query";
import { createLiveHub, createLiveInvalidationProxy } from "../src/server";
import { applyInvalidationEvent } from "../src/client";
import type { TrpcLiveInvalidationEvent } from "../src/shared/types";
import type { AppRouter } from "./fixtures/appRouter";
import { createTestQueryClient } from "./fixtures/queryClient";
import { trpc } from "./fixtures/trpcClient";

const keyFor = getQueryKey as unknown as (
  node: unknown,
  input?: unknown,
  type?: "query",
) => readonly unknown[];

/**
 * Proves the server→client contract: the event a backend `ctx.live.*.invalidate()`
 * emits is exactly what the client applier consumes to invalidate the matching
 * `useQuery` cache entry — without going over the wire.
 */
describe("server → client invalidation contract", () => {
  it("invalidates the matching client query for a single invalidation", async () => {
    const hub = createLiveHub();
    const live = createLiveInvalidationProxy<AppRouter>({ hub });
    const received: TrpcLiveInvalidationEvent[] = [];
    hub.subscribe((event) => received.push(event));

    await live.response.list.invalidate({ requestId: "r" });
    expect(received).toHaveLength(1);

    const queryClient = createTestQueryClient();
    const key = keyFor(trpc.response.list, { requestId: "r" }, "query");
    queryClient.setQueryData(key, []);

    applyInvalidationEvent({ queryClient, event: received[0] });
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("invalidates every targeted client query for a batched event", async () => {
    const hub = createLiveHub();
    const live = createLiveInvalidationProxy<AppRouter>({ hub });
    const received: TrpcLiveInvalidationEvent[] = [];
    hub.subscribe((event) => received.push(event));

    await live.batch(async () => {
      await live.response.list.invalidate({ requestId: "r" });
      await live.dashboard.summary.invalidate({ organisationId: "o" });
    });

    expect(received).toHaveLength(1);

    const queryClient = createTestQueryClient();
    const k1 = keyFor(trpc.response.list, { requestId: "r" }, "query");
    const k2 = keyFor(trpc.dashboard.summary, { organisationId: "o" }, "query");
    queryClient.setQueryData(k1, []);
    queryClient.setQueryData(k2, null);

    applyInvalidationEvent({ queryClient, event: received[0] });
    expect(queryClient.getQueryState(k1)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(k2)?.isInvalidated).toBe(true);
  });
});
