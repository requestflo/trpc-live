import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createTRPCClient,
  httpBatchLink,
  splitLink,
} from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { getQueryKey } from "@trpc/react-query";
import { liveLink, openInvalidationStream } from "../../src/client/liveLink";
import { createTestQueryClient } from "../fixtures/queryClient";
import { trpc } from "../fixtures/trpcClient";
import type { AppRouter } from "../fixtures/appRouter";
import { MockEventSource } from "../utils/mockEventSource";

const keyFor = getQueryKey as unknown as (
  node: unknown,
  input?: unknown,
  type?: "query",
) => readonly unknown[];

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

function invalidationEvent() {
  return {
    id: "evt_1",
    type: "trpc.invalidate",
    targets: [
      { scope: "query", path: "response.list", input: { requestId: "r" } },
    ],
    createdAt: "2026-06-23T22:00:00.000Z",
  };
}

/**
 * A controllable operation-link standing in for httpSubscriptionLink, emitting
 * the raw link-layer envelopes httpSubscriptionLink actually produces.
 */
function controllableTransport() {
  const captured: {
    op?: { path: string; type: string };
    next?: (op: unknown) => unknown;
  } = {};
  let producer:
    | { next: (value: unknown) => void; error: (err: unknown) => void }
    | undefined;
  const transport = ((opts: {
    op: { path: string; type: string };
    next: (op: unknown) => unknown;
  }) => {
    captured.op = opts.op;
    captured.next = opts.next;
    return observable((obs) => {
      producer = obs as unknown as {
        next: (value: unknown) => void;
        error: (err: unknown) => void;
      };
      return () => undefined;
    });
  }) as never;
  return {
    transport,
    captured,
    emit: (v: unknown) => producer?.next(v),
    fail: (e: unknown) => producer?.error(e),
  };
}

describe("openInvalidationStream", () => {
  it("opens a subscription at the configured path and applies data envelopes", () => {
    const queryClient = createTestQueryClient();
    const key = keyFor(trpc.response.list, { requestId: "r" }, "query");
    queryClient.setQueryData(key, []);

    const { transport, captured, emit } = controllableTransport();
    const handle = openInvalidationStream(transport, {
      queryClient,
      path: "live.invalidations",
    });

    expect(captured.op?.type).toBe("subscription");
    expect(captured.op?.path).toBe("live.invalidations");
    expect(typeof handle.unsubscribe).toBe("function");

    emit({ result: { data: invalidationEvent() } });
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("applies tracked data envelopes (with an `id` field)", () => {
    const queryClient = createTestQueryClient();
    const key = keyFor(trpc.response.list, { requestId: "r" }, "query");
    queryClient.setQueryData(key, []);

    const { transport, emit } = controllableTransport();
    openInvalidationStream(transport, { queryClient });

    emit({ result: { id: "evt_9", data: invalidationEvent() } });
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("ignores lifecycle messages and non-invalidation data", () => {
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { transport, emit } = controllableTransport();
    openInvalidationStream(transport, { queryClient });

    emit({ result: { type: "started" } });
    emit({ result: { type: "state", state: "connecting", error: null } });
    emit({ result: { type: "stopped" } });
    emit({ result: { data: { hello: "world" } } });

    expect(spy).not.toHaveBeenCalled();
  });

  it("logs stream errors when debug is enabled", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { transport, fail } = controllableTransport();
    openInvalidationStream(transport, {
      queryClient: createTestQueryClient(),
      debug: true,
    });

    fail(new Error("dropped"));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("uses a terminating next() (the stream never falls through the chain)", () => {
    const { transport, captured } = controllableTransport();
    openInvalidationStream(transport, { queryClient: createTestQueryClient() });
    expect(() => captured.next?.({})).toThrow();
  });
});

describe("liveLink", () => {
  beforeEach(() => MockEventSource.reset());

  it("is a tRPC link factory", () => {
    const link = liveLink({ url: "/api/trpc" });
    expect(typeof link).toBe("function");
    expect(typeof link({})).toBe("function");
  });

  it("auto-opens exactly one SSE connection when given a queryClient", async () => {
    const client = createTRPCClient<AppRouter>({
      links: [
        liveLink({
          url: "/api/trpc",
          queryClient: createTestQueryClient(),
          EventSource: MockEventSource as never,
        }),
      ],
    });
    expect(client).toBeDefined();

    await tick();
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toContain("/api/trpc");
  });

  it("auto-opens one connection when used in splitLink (the drop-in setup)", async () => {
    const client = createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.type === "subscription",
          true: liveLink({
            url: "/api/trpc",
            queryClient: createTestQueryClient(),
            EventSource: MockEventSource as never,
          }),
          false: httpBatchLink({ url: "/api/trpc" }),
        }),
      ],
    });
    expect(client).toBeDefined();

    await tick();
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("opens no connection without a queryClient (pure httpSubscriptionLink)", async () => {
    createTRPCClient<AppRouter>({
      links: [
        liveLink({ url: "/api/trpc", EventSource: MockEventSource as never }),
      ],
    });

    await tick();
    expect(MockEventSource.instances).toHaveLength(0);
  });
});
