import { describe, it, expect, vi } from "vitest";
import { getQueryKey } from "@trpc/react-query";
import {
  applyInvalidationEvent,
  parseInvalidationEvent,
} from "../../src/client/applyInvalidationEvent";
import { createTestQueryClient } from "../fixtures/queryClient";
import { trpc } from "../fixtures/trpcClient";

const keyFor = getQueryKey as unknown as (
  node: unknown,
  input?: unknown,
  type?: "query",
) => readonly unknown[];

function makeEvent(targets: unknown[]) {
  return {
    id: "evt_1",
    type: "trpc.invalidate",
    targets,
    createdAt: "2026-06-23T22:00:00.000Z",
  };
}

describe("parseInvalidationEvent", () => {
  it("rejects non-objects and wrong types", () => {
    expect(parseInvalidationEvent(null)).toBeNull();
    expect(parseInvalidationEvent("nope")).toBeNull();
    expect(parseInvalidationEvent({ type: "other", targets: [] })).toBeNull();
    expect(parseInvalidationEvent({ type: "trpc.invalidate" })).toBeNull();
  });

  it("filters out malformed targets", () => {
    const event = parseInvalidationEvent(
      makeEvent([
        { scope: "all" },
        { scope: "bogus" },
        { scope: "query" }, // missing path
        { scope: "router", path: "response" },
      ]),
    );
    expect(event?.targets).toEqual([
      { scope: "all" },
      { scope: "router", path: "response" },
    ]);
  });
});

describe("applyInvalidationEvent", () => {
  it("applies each valid target and returns the parsed event", () => {
    const queryClient = createTestQueryClient();
    const key = keyFor(trpc.response.list, { requestId: "r" }, "query");
    queryClient.setQueryData(key, []);

    const result = applyInvalidationEvent({
      queryClient,
      event: makeEvent([
        { scope: "query", path: "response.list", input: { requestId: "r" } },
      ]),
    });

    expect(result?.id).toBe("evt_1");
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("ignores malformed events without invalidating or throwing", () => {
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const result = applyInvalidationEvent({
      queryClient,
      event: { type: "not.this" },
    });

    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
