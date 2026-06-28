import { describe, it, expect } from "vitest";
import { createLiveInvalidationProxy } from "../../src/server";
import type { PublishInvalidationInput } from "../../src/shared/types";
import type { AppRouter } from "../fixtures/appRouter";

function setup() {
  const published: PublishInvalidationInput[] = [];
  const live = createLiveInvalidationProxy<AppRouter>({
    publish: (input) => {
      published.push(input);
    },
  });
  return { live, published };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("batch", () => {
  it("publishes one event for multiple invalidations", async () => {
    const { live, published } = setup();

    await live.batch(async () => {
      await live.response.list.invalidate({ requestId: "req_1" });
      await live.dashboard.summary.invalidate({ organisationId: "org_1" });
      await live.inbox.list.invalidate({ organisationId: "org_1" });
    });

    expect(published).toHaveLength(1);
    expect(published[0]?.targets).toHaveLength(3);
  });

  it("returns the callback result", async () => {
    const { live, published } = setup();
    const result = await live.batch(async () => "done");
    expect(result).toBe("done");
    expect(published).toHaveLength(0);
  });

  it("publishes nothing when there are no invalidations", async () => {
    const { live, published } = setup();
    await live.batch(async () => {
      // no-op
    });
    expect(published).toHaveLength(0);
  });

  it("discards collected targets when the callback throws", async () => {
    const { live, published } = setup();

    await expect(
      live.batch(async () => {
        await live.response.list.invalidate({ requestId: "req_1" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(published).toHaveLength(0);

    // Engine state is cleared: later invalidations publish normally.
    await live.response.list.invalidate({ requestId: "req_2" });
    expect(published).toHaveLength(1);
  });

  it("collects async invalidations across awaits into one event", async () => {
    const { live, published } = setup();

    await live.batch(async () => {
      await delay(5);
      await live.response.list.invalidate({ requestId: "req_1" });
      await delay(5);
      await live.dashboard.summary.invalidate({ organisationId: "org_1" });
    });

    expect(published).toHaveLength(1);
    expect(published[0]?.targets).toHaveLength(2);
  });

  it("coalesces nested batches into one event", async () => {
    const { live, published } = setup();

    await live.batch(async () => {
      await live.response.list.invalidate({ requestId: "req_1" });
      await live.batch(async () => {
        await live.inbox.list.invalidate({ organisationId: "org_1" });
      });
    });

    expect(published).toHaveLength(1);
    expect(published[0]?.targets).toHaveLength(2);
  });
});
