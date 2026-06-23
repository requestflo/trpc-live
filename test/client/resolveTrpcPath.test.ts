import { describe, it, expect } from "vitest";
import { getQueryKey } from "@trpc/react-query";
import { resolveTrpcPath } from "../../src/client/resolveTrpcPath";
import { trpc } from "../fixtures/trpcClient";

const queryKeyOf = getQueryKey as unknown as (node: unknown) => unknown[];

describe("resolveTrpcPath", () => {
  it("resolves response.list to trpc.response.list", () => {
    const node = resolveTrpcPath(trpc, "response.list");
    expect(node).toBeDefined();
    expect(queryKeyOf(node)).toEqual(queryKeyOf(trpc.response.list));
    expect(queryKeyOf(node)).toEqual([["response", "list"]]);
  });

  it("resolves dashboard.summary to trpc.dashboard.summary", () => {
    const node = resolveTrpcPath(trpc, "dashboard.summary");
    expect(queryKeyOf(node)).toEqual(queryKeyOf(trpc.dashboard.summary));
    expect(queryKeyOf(node)).toEqual([["dashboard", "summary"]]);
  });

  it("resolves the router path response to trpc.response", () => {
    const node = resolveTrpcPath(trpc, "response");
    expect(queryKeyOf(node)).toEqual(queryKeyOf(trpc.response));
    expect(queryKeyOf(node)).toEqual([["response"]]);
  });

  it("resolves deep paths", () => {
    const node = resolveTrpcPath(trpc, "request.byId");
    expect(queryKeyOf(node)).toEqual(queryKeyOf(trpc.request.byId));
    expect(queryKeyOf(node)).toEqual([["request", "byId"]]);
  });

  it("ignores unknown paths safely", () => {
    // Plain objects return undefined for missing segments.
    expect(resolveTrpcPath({}, "nope.missing")).toBeUndefined();
    expect(resolveTrpcPath(null, "x")).toBeUndefined();
    expect(resolveTrpcPath(trpc, "")).toBeUndefined();
    // The real proxy is permissive but must never throw.
    expect(() => resolveTrpcPath(trpc, "totally.unknown.path")).not.toThrow();
  });
});
