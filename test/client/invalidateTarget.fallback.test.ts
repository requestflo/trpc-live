import { describe, it, expect, vi } from "vitest";
import { invalidateTarget } from "../../src/client/invalidateTarget";
import { createTestQueryClient } from "../fixtures/queryClient";

// When `trpc` is not a real proxy, invalidateTarget falls back to building the
// query key directly from the path — these keys must still match what tRPC
// would register.

describe("invalidateTarget without a real tRPC proxy", () => {
  it("builds a matching query key for a query-scope target", () => {
    const qc = createTestQueryClient();
    const key = [["response", "list"], { input: { requestId: "r" }, type: "query" }];
    qc.setQueryData(key, []);

    invalidateTarget({
      trpc: {},
      queryClient: qc,
      target: { scope: "query", path: "response.list", input: { requestId: "r" } },
    });

    expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("builds a procedure key that matches all inputs", () => {
    const qc = createTestQueryClient();
    const key = [["response", "list"], { input: { requestId: "r" }, type: "query" }];
    qc.setQueryData(key, []);

    invalidateTarget({
      trpc: {},
      queryClient: qc,
      target: { scope: "procedure", path: "response.list" },
    });

    expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("builds a router key that matches nested queries", () => {
    const qc = createTestQueryClient();
    const key = [["response", "list"], { input: { requestId: "r" }, type: "query" }];
    qc.setQueryData(key, []);

    invalidateTarget({
      trpc: undefined,
      queryClient: qc,
      target: { scope: "router", path: "response" },
    });

    expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("logs and ignores an unknown scope when debug is enabled", () => {
    const qc = createTestQueryClient();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    invalidateTarget({
      trpc: {},
      queryClient: qc,
      target: { scope: "nope" } as never,
      debug: true,
    });

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
