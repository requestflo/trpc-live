import { describe, it, expect, vi } from "vitest";
import { createLiveHub } from "../../src/server/hub";
import type { TrpcLiveInvalidationEvent } from "../../src/shared/types";

describe("createLiveHub", () => {
  it("publish fills id/type/createdAt and emits to subscribers", () => {
    const hub = createLiveHub();
    const received: TrpcLiveInvalidationEvent[] = [];
    hub.subscribe((event) => received.push(event));

    const event = hub.publish({ targets: [{ scope: "all" }] });

    expect(event.id).toMatch(/^evt_/);
    expect(event.type).toBe("trpc.invalidate");
    expect(event.createdAt).toBe(new Date(event.createdAt).toISOString());
    expect(received).toEqual([event]);
  });

  it("emit delivers to multiple subscribers in subscription order", () => {
    const hub = createLiveHub();
    const order: string[] = [];
    hub.subscribe(() => order.push("a"));
    hub.subscribe(() => order.push("b"));

    hub.emit({
      id: "evt_1",
      type: "trpc.invalidate",
      targets: [{ scope: "all" }],
      createdAt: "2026-06-23T22:00:00.000Z",
    });

    expect(order).toEqual(["a", "b"]);
  });

  it("stops delivery after unsubscribe", () => {
    const hub = createLiveHub();
    const received: string[] = [];
    const off = hub.subscribe((event) => received.push(event.id));

    hub.publish({ targets: [{ scope: "all" }] });
    off();
    hub.publish({ targets: [{ scope: "all" }] });

    expect(received).toHaveLength(1);
  });

  it("rejects publishing with no targets", () => {
    const hub = createLiveHub();
    expect(() => hub.publish({ targets: [] })).toThrow();
  });

  it("isolates subscriber errors via onError", () => {
    const onError = vi.fn();
    const hub = createLiveHub({ onError });
    const received: string[] = [];

    hub.subscribe(() => {
      throw new Error("bad listener");
    });
    hub.subscribe((event) => received.push(event.id));

    hub.publish({ targets: [{ scope: "all" }] });

    expect(received).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("tracks listenerCount", () => {
    const hub = createLiveHub();
    expect(hub.listenerCount).toBe(0);
    const off = hub.subscribe(() => undefined);
    expect(hub.listenerCount).toBe(1);
    off();
    expect(hub.listenerCount).toBe(0);
  });
});
