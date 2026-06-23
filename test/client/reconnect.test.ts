import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTrpcLiveClient } from "../../src/client/createTrpcLiveClient";
import { createTestQueryClient } from "../fixtures/queryClient";
import { trpc } from "../fixtures/trpcClient";
import {
  createMockEventSourceFactory,
  type MockEventSource,
} from "../utils/mockEventSource";

function at(instances: MockEventSource[], index: number): MockEventSource {
  const source = instances[index];
  if (!source) throw new Error(`No EventSource instance at index ${index}`);
  return source;
}

describe("reconnect", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("attempts to reconnect after an SSE error", () => {
    const { factory, instances } = createMockEventSourceFactory();
    const client = createTrpcLiveClient({
      url: "/sse",
      trpc,
      queryClient: createTestQueryClient(),
      eventSourceFactory: factory,
      reconnect: { minDelayMs: 500, maxDelayMs: 5000 },
    });

    client.connect();
    expect(instances).toHaveLength(1);
    at(instances, 0).emitOpen();
    at(instances, 0).emitError();

    vi.advanceTimersByTime(500);
    expect(instances).toHaveLength(2);

    client.close();
  });

  it("applies exponential backoff between attempts", () => {
    const { factory, instances } = createMockEventSourceFactory();
    const client = createTrpcLiveClient({
      url: "/sse",
      trpc,
      queryClient: createTestQueryClient(),
      eventSourceFactory: factory,
      reconnect: { minDelayMs: 500, maxDelayMs: 5000 },
    });

    client.connect();
    at(instances, 0).emitError();

    vi.advanceTimersByTime(499);
    expect(instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(2); // first retry after 500ms

    at(instances, 1).emitError();
    vi.advanceTimersByTime(999);
    expect(instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(3); // second retry after 1000ms

    client.close();
  });

  it("stops reconnecting after the client is closed", () => {
    const { factory, instances } = createMockEventSourceFactory();
    const client = createTrpcLiveClient({
      url: "/sse",
      trpc,
      queryClient: createTestQueryClient(),
      eventSourceFactory: factory,
      reconnect: { minDelayMs: 500 },
    });

    client.connect();
    at(instances, 0).emitError();
    client.close();

    vi.advanceTimersByTime(10_000);
    expect(instances).toHaveLength(1);
  });

  it("does not reconnect when reconnect is disabled", () => {
    const { factory, instances } = createMockEventSourceFactory();
    const client = createTrpcLiveClient({
      url: "/sse",
      trpc,
      queryClient: createTestQueryClient(),
      eventSourceFactory: factory,
      reconnect: { enabled: false },
    });

    client.connect();
    at(instances, 0).emitOpen();
    at(instances, 0).emitError();

    vi.advanceTimersByTime(10_000);
    expect(instances).toHaveLength(1);
    expect(client.getStatus().state).toBe("error");

    client.close();
  });

  it("onReconnect 'nothing' does not invalidate", () => {
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { factory, instances } = createMockEventSourceFactory();
    const client = createTrpcLiveClient({
      url: "/sse",
      trpc,
      queryClient,
      eventSourceFactory: factory,
      reconnect: { minDelayMs: 100, onReconnect: "nothing" },
    });

    client.connect();
    at(instances, 0).emitOpen();
    spy.mockClear();
    at(instances, 0).emitError();
    vi.advanceTimersByTime(100);
    at(instances, 1).emitOpen();

    expect(spy).not.toHaveBeenCalled();
    client.close();
  });

  it("onReconnect 'invalidate-all' invalidates all queries", () => {
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { factory, instances } = createMockEventSourceFactory();
    const client = createTrpcLiveClient({
      url: "/sse",
      trpc,
      queryClient,
      eventSourceFactory: factory,
      reconnect: { minDelayMs: 100, onReconnect: "invalidate-all" },
    });

    client.connect();
    at(instances, 0).emitOpen();
    spy.mockClear();
    at(instances, 0).emitError();
    vi.advanceTimersByTime(100);
    at(instances, 1).emitOpen();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith();
    client.close();
  });

  it("onReconnect 'invalidate-active' invalidates active queries only", () => {
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { factory, instances } = createMockEventSourceFactory();
    const client = createTrpcLiveClient({
      url: "/sse",
      trpc,
      queryClient,
      eventSourceFactory: factory,
      reconnect: { minDelayMs: 100, onReconnect: "invalidate-active" },
    });

    client.connect();
    at(instances, 0).emitOpen();
    spy.mockClear();
    at(instances, 0).emitError();
    vi.advanceTimersByTime(100);
    at(instances, 1).emitOpen();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ type: "active" });
    expect(client.getStatus().reconnectCount).toBe(1);
    client.close();
  });
});
