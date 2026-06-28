import { describe, it, expect, vi, beforeEach } from "vitest";
import { observable } from "@trpc/server/observable";
import { getQueryKey } from "@trpc/react-query";
import { createLiveOperationLink, liveLink } from "../../src/client/liveLink";
import { createTestQueryClient } from "../fixtures/queryClient";
import { trpc } from "../fixtures/trpcClient";
import { MockEventSource } from "../utils/mockEventSource";

const keyFor = getQueryKey as unknown as (
  node: unknown,
  input?: unknown,
  type?: "query",
) => readonly unknown[];

function subOp(path: string) {
  return {
    id: 1,
    type: "subscription" as const,
    path,
    input: undefined,
    context: {},
    signal: null,
  };
}

const noopNext = (() => observable(() => undefined)) as never;

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
 * Wire a controllable transport through createLiveOperationLink and return an
 * `emit` that pushes raw link-layer envelopes (the shape httpSubscriptionLink
 * actually produces).
 */
function setupTap(
  path: string,
  queryClient: ReturnType<typeof createTestQueryClient>,
) {
  let producer: { next: (value: unknown) => void } | undefined;
  const transport = (() =>
    observable((obs) => {
      producer = obs as unknown as { next: (value: unknown) => void };
      return () => undefined;
    })) as never;

  const link = createLiveOperationLink(transport, {
    queryClient,
    path: "live.invalidations",
  });
  const out$ = link({ op: subOp(path) as never, next: noopNext });
  out$.subscribe({});

  return { emit: (value: unknown) => producer?.next(value) };
}

describe("createLiveOperationLink", () => {
  it("applies a data envelope (no `type` field, as httpSubscriptionLink emits)", () => {
    const queryClient = createTestQueryClient();
    const key = keyFor(trpc.response.list, { requestId: "r" }, "query");
    queryClient.setQueryData(key, []);

    const { emit } = setupTap("live.invalidations", queryClient);
    emit({ result: { data: invalidationEvent() } });

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("applies a tracked data envelope (with an `id` field)", () => {
    const queryClient = createTestQueryClient();
    const key = keyFor(trpc.response.list, { requestId: "r" }, "query");
    queryClient.setQueryData(key, []);

    const { emit } = setupTap("live.invalidations", queryClient);
    emit({ result: { id: "evt_123", data: invalidationEvent() } });

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("ignores lifecycle messages (started / state)", () => {
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { emit } = setupTap("live.invalidations", queryClient);
    emit({ result: { type: "started" }, context: {} });
    emit({ result: { type: "state", state: "connecting", error: null } });
    emit({ result: { type: "stopped" } });

    expect(spy).not.toHaveBeenCalled();
  });

  it("passes other subscriptions through untouched", () => {
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { emit } = setupTap("chat.messages", queryClient);
    emit({ result: { data: { hello: "world" } } });

    expect(spy).not.toHaveBeenCalled();
  });

  it("is a pass-through with no queryClient", () => {
    const transport = (() => observable(() => undefined)) as never;
    const link = createLiveOperationLink(transport, { path: "live.invalidations" });
    const out$ = link({ op: subOp("live.invalidations") as never, next: noopNext });
    expect(() => out$.subscribe({})).not.toThrow();
  });
});

describe("liveLink", () => {
  beforeEach(() => MockEventSource.reset());

  it("is a tRPC link factory", () => {
    const link = liveLink({ url: "/api/trpc" });
    expect(typeof link).toBe("function");
    expect(typeof link({})).toBe("function");
  });

  it("delegates subscription transport to httpSubscriptionLink", async () => {
    const queryClient = createTestQueryClient();
    const operationLink = liveLink({
      url: "/api/trpc",
      queryClient,
      EventSource: MockEventSource as never,
    })({});

    const out$ = operationLink({
      op: subOp("live.invalidations") as never,
      next: noopNext,
    });
    out$.subscribe({});

    // httpSubscriptionLink resolves the URL before constructing the EventSource.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toContain("/api/trpc");
  });
});
