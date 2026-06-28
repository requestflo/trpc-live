import { describe, it, expect, vi } from "vitest";
import { invalidateTarget } from "./src/client/invalidateTarget";
import { createTestQueryClient } from "./test/fixtures/queryClient";

describe("invalidateTarget with circular input", () => {
  it("should not throw when given circular reference in input", () => {
    const qc = createTestQueryClient();
    const circular = { a: 1 } as any;
    circular.self = circular;

    const spy = vi.spyOn(qc, "invalidateQueries");

    expect(() => {
      invalidateTarget({
        queryClient: qc,
        target: {
          scope: "query",
          path: "test.path",
          input: circular,
        },
        debug: true,
      });
    }).not.toThrow();

    // Check if invalidateQueries was even called
    console.log("invalidateQueries calls:", spy.mock.calls.length);
  });
});
