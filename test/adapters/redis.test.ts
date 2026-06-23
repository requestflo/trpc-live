import { describe, it, expect, vi } from "vitest";
import { createRedisPubSub } from "../../src/server/redis";
import { DEFAULT_PUBSUB_CHANNEL } from "../../src/shared/constants";
import type { TrpcLiveInvalidationEvent } from "../../src/shared/types";
import { createRedisMock } from "../fixtures/redisMock";

function makeEvent(id = "evt_1"): TrpcLiveInvalidationEvent {
  return {
    id,
    type: "trpc.invalidate",
    targets: [{ scope: "all" }],
    createdAt: "2026-06-23T22:00:00.000Z",
  };
}

describe("createRedisPubSub", () => {
  it("publishes a stringified event", async () => {
    const { publisher, subscriber } = createRedisMock();
    const pubsub = createRedisPubSub({ publisher, subscriber });
    const event = makeEvent();

    await pubsub.publish(event);

    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]?.message).toBe(JSON.stringify(event));
  });

  it("publishes to the default channel", async () => {
    const { publisher, subscriber } = createRedisMock();
    const pubsub = createRedisPubSub({ publisher, subscriber });
    await pubsub.publish(makeEvent());
    expect(publisher.published[0]?.channel).toBe(DEFAULT_PUBSUB_CHANNEL);
  });

  it("supports a custom channel name", async () => {
    const { publisher, subscriber } = createRedisMock();
    const pubsub = createRedisPubSub({
      publisher,
      subscriber,
      channel: "custom:channel",
    });

    const received: string[] = [];
    await pubsub.subscribe((event) => received.push(event.id));
    await pubsub.publish(makeEvent("evt_custom"));

    expect(publisher.published[0]?.channel).toBe("custom:channel");
    expect(subscriber.subscribedChannels.has("custom:channel")).toBe(true);
    expect(received).toEqual(["evt_custom"]);
  });

  it("registers a message handler and delivers parsed events", async () => {
    const { publisher, subscriber } = createRedisMock();
    const pubsub = createRedisPubSub({ publisher, subscriber });

    const received: TrpcLiveInvalidationEvent[] = [];
    await pubsub.subscribe((event) => received.push(event));

    expect(subscriber.onCalls).toBe(1);
    expect(subscriber.subscribedChannels.has(DEFAULT_PUBSUB_CHANNEL)).toBe(true);

    await pubsub.publish(makeEvent("evt_2"));
    expect(received).toHaveLength(1);
    expect(received[0]?.id).toBe("evt_2");
  });

  it("reports malformed JSON via onError without delivering", async () => {
    const { publisher, subscriber } = createRedisMock();
    const onError = vi.fn();
    const pubsub = createRedisPubSub({ publisher, subscriber, onError });

    const received: unknown[] = [];
    await pubsub.subscribe((event) => received.push(event));

    subscriber.emit(DEFAULT_PUBSUB_CHANNEL, "{ not json");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(0);
  });

  it("ignores messages from other channels", async () => {
    const { publisher, subscriber } = createRedisMock();
    const pubsub = createRedisPubSub({ publisher, subscriber, channel: "a" });

    const received: unknown[] = [];
    await pubsub.subscribe((event) => received.push(event));

    subscriber.emit("b", JSON.stringify(makeEvent()));

    expect(received).toHaveLength(0);
  });

  it("calls Redis unsubscribe on cleanup", async () => {
    const { publisher, subscriber } = createRedisMock();
    const pubsub = createRedisPubSub({ publisher, subscriber });

    const unsubscribe = await pubsub.subscribe(() => undefined);
    await unsubscribe();

    expect(subscriber.unsubscribeCalls).toContain(DEFAULT_PUBSUB_CHANNEL);
  });
});
