import type { QueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import type { TrpcInvalidationTarget } from "../shared/types";
import { resolveTrpcPath } from "./resolveTrpcPath";

type QueryKeyType = "query" | "infinite" | "any";

// tRPC's `getQueryKey` has a strict, proxy-derived overload. We resolve nodes
// dynamically, so call it through a permissive signature.
const getQueryKeyLoose = getQueryKey as unknown as (
  procedureOrRouter: unknown,
  input?: unknown,
  type?: QueryKeyType,
) => unknown[];

export type InvalidateTargetArgs = {
  trpc: unknown;
  queryClient: QueryClient;
  target: TrpcInvalidationTarget;
  debug?: boolean;
};

/**
 * Replicates tRPC's internal `getQueryKeyInternal` so we can always produce a
 * key identical to the one `useQuery` registered, even when `trpc` is a mock.
 */
function buildQueryKeyInternal(
  segments: string[],
  input: unknown,
  type: QueryKeyType,
): unknown[] {
  const splitPath = segments.flatMap((part) => part.split("."));
  if (!input && (type === "any" || !type)) {
    return splitPath.length ? [splitPath] : [];
  }
  const meta: { input?: unknown; type?: Exclude<QueryKeyType, "any"> } = {};
  if (typeof input !== "undefined") meta.input = input;
  if (type && type !== "any") meta.type = type;
  return [splitPath, meta];
}

/**
 * Convert a `(path, input, type)` triple into a TanStack Query key. Prefers
 * tRPC's official `getQueryKey` (resolved via the proxy) and falls back to the
 * deterministic builder when `trpc` isn't a real proxy.
 */
function toQueryKey(
  trpc: unknown,
  path: string,
  input: unknown,
  type: QueryKeyType,
): unknown[] {
  const node = resolveTrpcPath(trpc, path);
  if (node != null && (typeof node === "object" || typeof node === "function")) {
    const def = (node as { _def?: unknown })._def;
    if (typeof def === "function") {
      try {
        return getQueryKeyLoose(node, input, type);
      } catch {
        // fall through to the deterministic builder
      }
    }
  }
  return buildQueryKeyInternal(path ? path.split(".") : [], input, type);
}

/**
 * Apply a single invalidation target to the local cache. Invalid or unknown
 * targets are ignored safely; this never throws.
 */
export function invalidateTarget(args: InvalidateTargetArgs): void {
  const { trpc, queryClient, target, debug } = args;

  try {
    switch (target?.scope) {
      case "all": {
        queryClient.invalidateQueries();
        return;
      }
      case "router": {
        const queryKey = toQueryKey(trpc, target.path, undefined, "any");
        queryClient.invalidateQueries({ queryKey });
        return;
      }
      case "procedure": {
        const queryKey = toQueryKey(trpc, target.path, undefined, "query");
        queryClient.invalidateQueries({ queryKey });
        return;
      }
      case "query": {
        const queryKey = toQueryKey(trpc, target.path, target.input, "query");
        queryClient.invalidateQueries({ queryKey });
        return;
      }
      default: {
        if (debug) {
          // eslint-disable-next-line no-console
          console.warn("[trpc-live] ignoring target with unknown scope", target);
        }
      }
    }
  } catch (error) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn("[trpc-live] failed to invalidate target", target, error);
    }
  }
}
