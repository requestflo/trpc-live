import { describe, it, expect, vi, afterEach } from "vitest";
import { createTrpcLiveClient } from "../../src/client/createTrpcLiveClient";
import { createTestQueryClient } from "../fixtures/queryClient";
import { trpc } from "../fixtures/trpcClient";
import { createMockEventSourceFactory } from "../utils/mockEventSource";

afterEach(() => vi.unstubAllGlobals());

function makeClient(overrides = {}) {
  const { factory, instances } = createMockEventSourceFactory();
  const client = createTrpcLiveClient({
    url: "/sse",
    trpc,
    queryClient: createTestQueryClient(),
    eventSourceFactory: factory,
    ...overrides,
  });
  return { client, instances };
}

describe("createTrpcLiveClient", () => {
  it("reports an error when no EventSource implementation is available", () => {
    vi.stubGlobal("EventSource", undefined);
    const client = createTrpcLiveClient({
      url: "/sse",
      trpc,
      queryClient: createTestQueryClient(),
    });

    client.connect();
    expect(client.getStatus().state).toBe("error");
    client.close();
  });

  it("uses a global EventSource when no factory is provided", () => {
    const { factory, instances } = createMockEventSourceFactory();
    vi.stubGlobal(
      "EventSource",
      function (this: unknown, url: string, init?: { withCredentials?: boolean }) {
        return factory(url, init);
      },
    );

    const client = createTrpcLiveClient({
      url: "/sse",
      trpc,
      queryClient: createTestQueryClient(),
    });
    client.connect();

    expect(instances).toHaveLength(1);
    client.close();
  });

  it("is idempotent: connect() only opens once", () => {
    const { client, instances } = makeClient();
    client.connect();
    client.connect();
    expect(instances).toHaveLength(1);
    client.close();
  });

  it("notifies status subscribers and supports unsubscribe", () => {
    const { client, instances } = makeClient();
    const states: string[] = [];
    const unsubscribe = client.subscribe((status) => states.push(status.state));

    client.connect();
    const source = instances[0];
    if (!source) throw new Error("no source");
    source.emitOpen();

    expect(states).toContain("connecting");
    expect(states).toContain("connected");

    unsubscribe();
    source.emitError();

    // After unsubscribing, later status changes are no longer delivered.
    expect(states).not.toContain("reconnecting");
    client.close();
  });

  it("debug-logs malformed payloads without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, instances } = makeClient({ debug: true });
    client.connect();
    const source = instances[0];
    if (!source) throw new Error("no source");
    source.emitOpen();

    expect(() => source.emitMessage("trpc.invalidate", "{ bad")).not.toThrow();
    expect(warn).toHaveBeenCalled();

    client.close();
    warn.mockRestore();
  });

  it("forwards withCredentials to the EventSource", () => {
    const { client, instances } = makeClient({ withCredentials: true });
    client.connect();
    expect(instances[0]?.withCredentials).toBe(true);
    client.close();
  });

  it("updates lastEventAt when a valid event arrives", () => {
    const { client, instances } = makeClient();
    client.connect();
    const source = instances[0];
    if (!source) throw new Error("no source");
    source.emitOpen();
    expect(client.getStatus().lastEventAt).toBeUndefined();

    source.emitMessage(
      "trpc.invalidate",
      JSON.stringify({
        id: "evt_1",
        type: "trpc.invalidate",
        targets: [{ scope: "all" }],
        createdAt: "2026-06-23T22:00:00.000Z",
      }),
    );

    expect(client.getStatus().lastEventAt).toBeInstanceOf(Date);
    client.close();
  });
});
