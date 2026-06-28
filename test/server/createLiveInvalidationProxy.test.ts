import { describe, it, expect, vi } from "vitest";
import { createLiveInvalidationProxy } from "../../src/server";
import { createLiveHub } from "../../src/server/hub";
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

  it("publishes an event for each invalidation outside a batch", async () => {
    const { live, publish } = setup();
    await live.response.list.invalidate({ requestId: "req_1" });
    await live.inbox.list.invalidate({ organisationId: "org_1" });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("publishes through a hub to its subscribers", async () => {
    const hub = createLiveHub();
    const received: PublishInvalidationInput["targets"][] = [];
    hub.subscribe((event) => received.push(event.targets));

    const live = createLiveInvalidationProxy<AppRouter>({ hub });
    await live.response.list.invalidate({ requestId: "req_1" });

    expect(received).toEqual([
      [{ scope: "query", path: "response.list", input: { requestId: "req_1" } }],
    ]);
  });
});
