import { describe, it, expect } from "vitest";
import { createInvalidationEvent } from "../../src/server/event";
import type { TrpcInvalidationTarget } from "../../src/shared/types";

const queryTarget: TrpcInvalidationTarget = {
  scope: "query",
  path: "response.list",
  input: { requestId: "req_123" },
};

describe("createInvalidationEvent", () => {
  it("generates an event id when missing", () => {
    const event = createInvalidationEvent({ targets: [queryTarget] });
    expect(event.id).toMatch(/^evt_/);
    expect(event.id.length).toBeGreaterThan(4);
  });

  it("uses a provided id", () => {
    const event = createInvalidationEvent(
      { targets: [queryTarget] },
      { id: "evt_fixed" },
    );
    expect(event.id).toBe("evt_fixed");
  });

  it("generates an ISO createdAt when missing", () => {
    const event = createInvalidationEvent({ targets: [queryTarget] });
    expect(event.createdAt).toBe(new Date(event.createdAt).toISOString());
  });

  it("uses a provided createdAt", () => {
    const event = createInvalidationEvent(
      { targets: [queryTarget] },
      { createdAt: "2026-06-23T22:00:00.000Z" },
    );
    expect(event.createdAt).toBe("2026-06-23T22:00:00.000Z");
  });

  it("always sets type to trpc.invalidate", () => {
    const event = createInvalidationEvent({ targets: [queryTarget] });
    expect(event.type).toBe("trpc.invalidate");
  });

  it("rejects empty targets", () => {
    expect(() => createInvalidationEvent({ targets: [] })).toThrow();
  });

  it("can include a channel", () => {
    const event = createInvalidationEvent({
      targets: [queryTarget],
      channel: "org:org_123",
    });
    expect(event.channel).toBe("org:org_123");
  });

  it("can include an actorId", () => {
    const event = createInvalidationEvent({
      targets: [queryTarget],
      actorId: "user_123",
    });
    expect(event.actorId).toBe("user_123");
  });

  it("omits the channel when not provided", () => {
    const event = createInvalidationEvent({ targets: [queryTarget] });
    expect(event.channel).toBeUndefined();
    expect("channel" in event).toBe(false);
  });
});
