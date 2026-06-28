import { describe, it, expect, vi } from "vitest";
import { getQueryKey } from "@trpc/react-query";
import { invalidateTarget } from "../../src/client/invalidateTarget";
import { trpc } from "../fixtures/trpcClient";
import { createTestQueryClient } from "../fixtures/queryClient";

// The exact key `trpc.X.useQuery(input)` would register — used to seed the
// cache so we prove our path-derived key matches tRPC's.
const keyFor = getQueryKey as unknown as (
  node: unknown,
  input?: unknown,
  type?: "query",
) => readonly unknown[];

function isInvalidated(
  qc: ReturnType<typeof createTestQueryClient>,
  key: readonly unknown[],
) {
  return qc.getQueryState(key)?.isInvalidated ?? false;
}

describe("invalidateTarget", () => {
  it("invalidates the exact query key for a query-scope target", () => {
    const qc = createTestQueryClient();
    const matching = keyFor(trpc.response.list, { requestId: "r1" }, "query");
    const other = keyFor(trpc.response.list, { requestId: "r2" }, "query");
    qc.setQueryData(matching, []);
    qc.setQueryData(other, []);

    invalidateTarget({
      queryClient: qc,
      target: { scope: "query", path: "response.list", input: { requestId: "r1" } },
    });

    expect(isInvalidated(qc, matching)).toBe(true);
    expect(isInvalidated(qc, other)).toBe(false);
  });

  it("invalidates every variant for a procedure-scope target", () => {
    const qc = createTestQueryClient();
    const a = keyFor(trpc.response.list, { requestId: "r1" }, "query");
    const b = keyFor(trpc.response.list, { requestId: "r2" }, "query");
    qc.setQueryData(a, []);
    qc.setQueryData(b, []);

    invalidateTarget({
      queryClient: qc,
      target: { scope: "procedure", path: "response.list" },
    });

    expect(isInvalidated(qc, a)).toBe(true);
    expect(isInvalidated(qc, b)).toBe(true);
  });

  it("invalidates the whole router for a router-scope target", () => {
    const qc = createTestQueryClient();
    const list = keyFor(trpc.response.list, { requestId: "r1" }, "query");
    const byId = keyFor(trpc.response.byId, { responseId: "x" }, "query");
    const unrelated = keyFor(trpc.dashboard.summary, { organisationId: "o" }, "query");
    qc.setQueryData(list, []);
    qc.setQueryData(byId, null);
    qc.setQueryData(unrelated, null);

    invalidateTarget({
      queryClient: qc,
      target: { scope: "router", path: "response" },
    });

    expect(isInvalidated(qc, list)).toBe(true);
    expect(isInvalidated(qc, byId)).toBe(true);
    expect(isInvalidated(qc, unrelated)).toBe(false);
  });

  it("invalidates all queries for an all-scope target", () => {
    const qc = createTestQueryClient();
    const a = keyFor(trpc.response.list, { requestId: "r1" }, "query");
    const b = keyFor(trpc.dashboard.summary, { organisationId: "o" }, "query");
    qc.setQueryData(a, []);
    qc.setQueryData(b, null);

    invalidateTarget({ queryClient: qc, target: { scope: "all" } });

    expect(isInvalidated(qc, a)).toBe(true);
    expect(isInvalidated(qc, b)).toBe(true);
  });

  it("does not throw for an invalid target and performs no invalidation", () => {
    const qc = createTestQueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    expect(() =>
      invalidateTarget({ queryClient: qc, target: { scope: "bogus" } as never, debug: true }),
    ).not.toThrow();

    expect(spy).not.toHaveBeenCalled();
  });

  it("swallows invalidateQueries errors (with debug logging)", () => {
    const qc = createTestQueryClient();
    vi.spyOn(qc, "invalidateQueries").mockImplementation(() => {
      throw new Error("boom");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() =>
      invalidateTarget({ queryClient: qc, target: { scope: "all" }, debug: true }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
