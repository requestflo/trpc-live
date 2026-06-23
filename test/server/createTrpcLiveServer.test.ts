import { describe, it, expect } from "vitest";
import { createTrpcLiveServer } from "../../src/server";
import { createMemoryPubSub } from "../../src/server/memory";
import type { TrpcLiveInvalidationEvent } from "../../src/shared/types";
import { makeFrameReader } from "../utils/sse";

type User = { id: string; allowedChannels: string[] };

const sseRequest = () => new Request("http://localhost/api/live/sse");

describe("createTrpcLiveServer", () => {
  it("publish builds an event, returns it, and pushes it to the pubsub", async () => {
    const pubsub = createMemoryPubSub();
    const received: TrpcLiveInvalidationEvent[] = [];
    await pubsub.subscribe((event) => received.push(event));

    const server = createTrpcLiveServer({ pubsub, keepAliveMs: false });
    const event = await server.publish({ targets: [{ scope: "all" }] });

    expect(event.type).toBe("trpc.invalidate");
    expect(event.id).toMatch(/^evt_/);
    expect(received).toHaveLength(1);
    expect(received[0]?.id).toBe(event.id);

    await server.close();
  });

  it("handleSse returns a text/event-stream response", async () => {
    const pubsub = createMemoryPubSub();
    const server = createTrpcLiveServer({ pubsub, keepAliveMs: false });

    const response = await server.handleSse(sseRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(server.connectionCount).toBe(1);

    await server.close();
  });

  it("streams published events to a connected client", async () => {
    const pubsub = createMemoryPubSub();
    const server = createTrpcLiveServer({ pubsub, keepAliveMs: false });

    const response = await server.handleSse(sseRequest());
    const reader = makeFrameReader(response.body as ReadableStream<Uint8Array>);

    await server.publish({
      targets: [{ scope: "query", path: "response.list", input: { requestId: "r" } }],
    });

    const frame = await reader.nextEvent();
    expect(frame).toContain("event: trpc.invalidate");
    expect(frame).toContain('"path":"response.list"');

    await reader.cancel();
    await server.close();
  });

  it("filters events through canReceive", async () => {
    const pubsub = createMemoryPubSub();
    const server = createTrpcLiveServer<User>({
      pubsub,
      keepAliveMs: false,
      getUser: () => ({ id: "u1", allowedChannels: ["org:1"] }),
      canReceive: ({ user, event }) =>
        !event.channel || user.allowedChannels.includes(event.channel),
    });

    const response = await server.handleSse(sseRequest());
    const reader = makeFrameReader(response.body as ReadableStream<Uint8Array>);

    // Not allowed for this user, must be filtered out.
    await server.publish({
      targets: [{ scope: "router", path: "secret" }],
      channel: "org:2",
    });
    // Allowed — this is the frame the client should see first.
    await server.publish({
      targets: [{ scope: "router", path: "visible" }],
      channel: "org:1",
    });

    const frame = await reader.nextEvent();
    expect(frame).toContain('"path":"visible"');
    expect(frame).not.toContain("secret");

    await reader.cancel();
    await server.close();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const pubsub = createMemoryPubSub();
    const server = createTrpcLiveServer<User>({
      pubsub,
      keepAliveMs: false,
      getUser: () => null,
    });

    const response = await server.handleSse(sseRequest());
    expect(response.status).toBe(401);
    expect(server.connectionCount).toBe(0);

    await server.close();
  });

  it("removes a client when its stream is cancelled", async () => {
    const pubsub = createMemoryPubSub();
    const server = createTrpcLiveServer({ pubsub, keepAliveMs: false });

    const response = await server.handleSse(sseRequest());
    expect(server.connectionCount).toBe(1);

    await (response.body as ReadableStream<Uint8Array>).cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(server.connectionCount).toBe(0);
    await server.close();
  });

  it("suppresses an event for the originating actor when skipActor is set", async () => {
    const pubsub = createMemoryPubSub();
    const server = createTrpcLiveServer<User>({
      pubsub,
      keepAliveMs: false,
      getUser: () => ({ id: "u1", allowedChannels: [] }),
      getActorId: (user) => user.id,
    });

    const response = await server.handleSse(sseRequest());
    const reader = makeFrameReader(response.body as ReadableStream<Uint8Array>);

    // Caused by u1 with skipActor → u1 must not receive it.
    await server.publish({
      targets: [{ scope: "router", path: "mine" }],
      actorId: "u1",
      skipActor: true,
    });
    // Caused by someone else → u1 receives it.
    await server.publish({
      targets: [{ scope: "router", path: "theirs" }],
      actorId: "u2",
      skipActor: true,
    });

    const frame = await reader.nextEvent();
    expect(frame).toContain('"path":"theirs"');
    expect(frame).not.toContain("mine");

    await reader.cancel();
    await server.close();
  });
});
