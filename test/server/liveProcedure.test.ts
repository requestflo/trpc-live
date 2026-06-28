import { describe, it, expect } from "vitest";
import { createLiveHub } from "../../src/server/hub";
import {
  createLiveProcedure,
  liveInvalidations,
} from "../../src/server/liveProcedure";
import { createLiveInvalidationProxy } from "../../src/server/createLiveInvalidationProxy";
import type { AppRouter } from "../fixtures/appRouter";

describe("liveInvalidations", () => {
  it("yields hub events in order", async () => {
    const hub = createLiveHub();
    const ac = new AbortController();
    const iterator = liveInvalidations(hub, ac.signal)[Symbol.asyncIterator]();

    // The generator subscribes synchronously when `.next()` is first called.
    const pending1 = iterator.next();
    const event1 = hub.publish({ targets: [{ scope: "all" }] });
    expect((await pending1).value).toEqual(event1);

    const pending2 = iterator.next();
    const event2 = hub.publish({ targets: [{ scope: "router", path: "x" }] });
    expect((await pending2).value).toEqual(event2);

    ac.abort();
  });

  it("unsubscribes from the hub when the signal aborts", async () => {
    const hub = createLiveHub();
    const ac = new AbortController();
    const iterator = liveInvalidations(hub, ac.signal)[Symbol.asyncIterator]();

    const pending = iterator.next();
    expect(hub.listenerCount).toBe(1);

    ac.abort();
    const result = await pending;
    expect(result.done).toBe(true);
    expect(hub.listenerCount).toBe(0);
  });

  it("end-to-end: a proxy invalidation reaches the subscription consumer", async () => {
    const hub = createLiveHub();
    const live = createLiveInvalidationProxy<AppRouter>({ hub });
    const ac = new AbortController();
    const iterator = liveInvalidations(hub, ac.signal)[Symbol.asyncIterator]();

    const pending = iterator.next();
    await live.response.list.invalidate({ requestId: "req_1" });

    const { value } = await pending;
    expect(value?.targets[0]).toEqual({
      scope: "query",
      path: "response.list",
      input: { requestId: "req_1" },
    });

    ac.abort();
  });
});

describe("createLiveProcedure", () => {
  it("builds a procedure via the builder's subscription resolver", () => {
    const hub = createLiveHub();
    let captured:
      | ((opts: { signal: AbortSignal | undefined }) => AsyncIterable<unknown>)
      | undefined;

    const builder = {
      subscription(
        resolver: (opts: {
          signal: AbortSignal | undefined;
        }) => AsyncIterable<unknown>,
      ) {
        captured = resolver;
        return "PROCEDURE" as const;
      },
    };

    const procedure = createLiveProcedure(hub, builder);
    expect(procedure).toBe("PROCEDURE");

    const iterable = captured?.({ signal: undefined });
    expect(typeof iterable?.[Symbol.asyncIterator]).toBe("function");
  });
});
