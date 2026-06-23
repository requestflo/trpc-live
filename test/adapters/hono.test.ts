import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createTrpcLiveServer } from "../../src/server";
import { honoTrpcLiveAdapter } from "../../src/server/hono";
import { createMemoryPubSub } from "../../src/server/memory";
import { makeFrameReader } from "../utils/sse";

type User = { id: string; allowedChannels: string[] };

function mount(server: ReturnType<typeof createTrpcLiveServer>) {
  const app = new Hono();
  app.route("/api/live", honoTrpcLiveAdapter(server));
  return app;
}

describe("honoTrpcLiveAdapter", () => {
  it("exposes GET /sse with a text/event-stream content type", async () => {
    const server = createTrpcLiveServer({
      pubsub: createMemoryPubSub(),
      keepAliveMs: false,
    });
    const app = mount(server);

    const response = await app.request("/api/live/sse");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    await (response.body as ReadableStream<Uint8Array>).cancel();
    await server.close();
  });

  it("streams published events to a connected response", async () => {
    const server = createTrpcLiveServer({
      pubsub: createMemoryPubSub(),
      keepAliveMs: false,
    });
    const app = mount(server);

    const response = await app.request("/api/live/sse");
    const reader = makeFrameReader(response.body as ReadableStream<Uint8Array>);

    await server.publish({ targets: [{ scope: "all" }] });

    const frame = await reader.nextEvent();
    expect(frame).toContain("event: trpc.invalidate");
    expect(frame).toContain('"scope":"all"');

    await reader.cancel();
    await server.close();
  });

  it("sends global events to all connected clients", async () => {
    const server = createTrpcLiveServer({
      pubsub: createMemoryPubSub(),
      keepAliveMs: false,
    });
    const app = mount(server);

    const a = await app.request("/api/live/sse");
    const b = await app.request("/api/live/sse");
    const readerA = makeFrameReader(a.body as ReadableStream<Uint8Array>);
    const readerB = makeFrameReader(b.body as ReadableStream<Uint8Array>);
    expect(server.connectionCount).toBe(2);

    await server.publish({ targets: [{ scope: "router", path: "response" }] });

    const frameA = await readerA.nextEvent();
    const frameB = await readerB.nextEvent();
    expect(frameA).toContain('"path":"response"');
    expect(frameB).toContain('"path":"response"');

    await readerA.cancel();
    await readerB.cancel();
    await server.close();
  });

  it("only sends channel events to clients that pass canReceive", async () => {
    const server = createTrpcLiveServer<User>({
      pubsub: createMemoryPubSub(),
      keepAliveMs: false,
      getUser: () => ({ id: "u1", allowedChannels: ["org:1"] }),
      canReceive: ({ user, event }) =>
        !event.channel || user.allowedChannels.includes(event.channel),
    });
    const app = mount(server);

    const response = await app.request("/api/live/sse");
    const reader = makeFrameReader(response.body as ReadableStream<Uint8Array>);

    await server.publish({
      targets: [{ scope: "router", path: "hidden" }],
      channel: "org:2",
    });
    await server.publish({
      targets: [{ scope: "router", path: "shown" }],
      channel: "org:1",
    });

    const frame = await reader.nextEvent();
    expect(frame).toContain('"path":"shown"');
    expect(frame).not.toContain("hidden");

    await reader.cancel();
    await server.close();
  });

  it("removes disconnected clients", async () => {
    const server = createTrpcLiveServer({
      pubsub: createMemoryPubSub(),
      keepAliveMs: false,
    });
    const app = mount(server);

    const response = await app.request("/api/live/sse");
    expect(server.connectionCount).toBe(1);

    await (response.body as ReadableStream<Uint8Array>).cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(server.connectionCount).toBe(0);
    await server.close();
  });

  it("rejects unauthenticated requests", async () => {
    const server = createTrpcLiveServer<User>({
      pubsub: createMemoryPubSub(),
      keepAliveMs: false,
      getUser: () => null,
    });
    const app = mount(server);

    const response = await app.request("/api/live/sse");
    expect(response.status).toBe(401);

    await server.close();
  });
});
