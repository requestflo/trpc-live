import { describe, it, expect, vi } from "vitest";
import { createLiveInvalidationProxy } from "../../src/server";
import type {
  PublishInvalidationInput,
  TrpcInvalidationTarget,
} from "../../src/shared/types";
import type { AppRouter } from "../fixtures/appRouter";

function pathOf(target: TrpcInvalidationTarget | undefined): string | undefined {
  return target && "path" in target ? target.path : undefined;
}

function setup() {
  const published: PublishInvalidationInput[] = [];
  const publish = vi.fn((input: PublishInvalidationInput) => {
    published.push(input);
  });
  const live = createLiveInvalidationProxy<AppRouter>({ publish });
  return { live, published, publish };
}

describe("createLiveInvalidationProxy", () => {
  it("creates a query target with input", async () => {
    const { live, published } = setup();
    await live.response.list.invalidate({ requestId: "req_123" });

    expect(published).toHaveLength(1);
    expect(published[0]?.targets).toEqual([
      { scope: "query", path: "response.list", input: { requestId: "req_123" } },
    ]);
  });

  it("creates a procedure target with no input", async () => {
    const { live, published } = setup();
    await live.response.list.invalidate();

    expect(published[0]?.targets).toEqual([
      { scope: "procedure", path: "response.list" },
    ]);
  });

  it("creates a router target", async () => {
    const { live, published } = setup();
    await live.response.invalidate();

    expect(published[0]?.targets).toEqual([
      { scope: "router", path: "response" },
    ]);
  });

  it("creates an all target", async () => {
    const { live, published } = setup();
    await live.invalidate();

    expect(published[0]?.targets).toEqual([{ scope: "all" }]);
  });

  it("generates correct dot paths for nested procedures", async () => {
    const { live, published } = setup();
    await live.request.byId.invalidate({ requestId: "req_1" });
    await live.dashboard.summary.invalidate({ organisationId: "org_1" });

    expect(pathOf(published[0]?.targets[0])).toBe("request.byId");
    expect(pathOf(published[1]?.targets[0])).toBe("dashboard.summary");
  });

  it("includes a channel only when provided", async () => {
    const { live, published } = setup();
    await live.response.list.invalidate(
      { requestId: "req_1" },
      { channel: "org:org_1" },
    );
    expect(published[0]?.channel).toBe("org:org_1");
  });

  it("treats a missing channel as a global broadcast", async () => {
    const { live, published } = setup();
    await live.response.list.invalidate({ requestId: "req_1" });
    expect(published[0]?.channel).toBeUndefined();
  });

  it("forwards actorId and skipActor options", async () => {
    const { live, published } = setup();
    await live.response.list.invalidate(
      { requestId: "req_1" },
      { actorId: "user_1", skipActor: true },
    );
    expect(published[0]?.actorId).toBe("user_1");
    expect(published[0]?.skipActor).toBe(true);
  });

  it("publishes an event for each invalidation outside a batch", async () => {
    const { live, publish } = setup();
    await live.response.list.invalidate({ requestId: "req_1" });
    await live.inbox.list.invalidate({ organisationId: "org_1" });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("supports invalidate(undefined, options) as a procedure target", async () => {
    const { live, published } = setup();
    await live.response.list.invalidate(undefined, { channel: "org:1" });
    expect(published[0]?.targets).toEqual([
      { scope: "procedure", path: "response.list" },
    ]);
    expect(published[0]?.channel).toBe("org:1");
  });
});
