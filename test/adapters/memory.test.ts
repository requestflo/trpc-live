import { describe, it, expect, vi } from "vitest";
import { createMemoryPubSub } from "../../src/server/memory";
import type { TrpcLiveInvalidationEvent } from "../../src/shared/types";

function makeEvent(id: string): TrpcLiveInvalidationEvent {
  return {
    id,
    type: "trpc.invalidate",
    targets: [{ scope: "all" }],
    createdAt: "2026-06-23T22:00:00.000Z",
  };
}

describe("createMemoryPubSub", () => {
  it("delivers a published event to a subscriber", async () => {
    const pubsub = createMemoryPubSub();
    const received: string[] = [];
    await pubsub.subscribe((event) => received.push(event.id));

    await pubsub.publish(makeEvent("a"));

    expect(received).toEqual(["a"]);
  });

  it("stops delivery after unsubscribe", async () => {
    const pubsub = createMemoryPubSub();
    const received: string[] = [];
    const unsubscribe = await pubsub.subscribe((event) =>
      received.push(event.id),
    );

    await pubsub.publish(makeEvent("a"));
    await unsubscribe();
    await pubsub.publish(makeEvent("b"));

    expect(received).toEqual(["a"]);
  });

  it("delivers the same event to multiple subscribers", async () => {
    const pubsub = createMemoryPubSub();
    const first: string[] = [];
    const second: string[] = [];
    await pubsub.subscribe((event) => first.push(event.id));
    await pubsub.subscribe((event) => second.push(event.id));

    await pubsub.publish(makeEvent("a"));

    expect(first).toEqual(["a"]);
    expect(second).toEqual(["a"]);
  });

  it("isolates subscriber errors from other subscribers", async () => {
    const onError = vi.fn();
    const pubsub = createMemoryPubSub({ onError });
    const received: string[] = [];

    await pubsub.subscribe(() => {
      throw new Error("subscriber failed");
    });
    await pubsub.subscribe((event) => received.push(event.id));

    await pubsub.publish(makeEvent("a"));

    expect(received).toEqual(["a"]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("delivers events in order", async () => {
    const pubsub = createMemoryPubSub();
    const received: string[] = [];
    await pubsub.subscribe((event) => received.push(event.id));

    await pubsub.publish(makeEvent("a"));
    await pubsub.publish(makeEvent("b"));
    await pubsub.publish(makeEvent("c"));

    expect(received).toEqual(["a", "b", "c"]);
  });
});
