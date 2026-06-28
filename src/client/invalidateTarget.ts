import type { QueryClient } from "@tanstack/react-query";
import type { TrpcInvalidationTarget } from "../shared/types";

type QueryKeyType = "query" | "any";

/**
 * Build a TanStack Query key from a dotted path + input, reproducing tRPC's
 * internal `getQueryKeyInternal` exactly so the key matches what
 * `trpc.X.useQuery(input)` registered — no tRPC proxy required.
 */
function buildQueryKey(
  path: string,
  input: unknown,
  type: QueryKeyType,
): unknown[] {
  const splitPath = path.length ? path.split(".") : [];
  if (!input && type === "any") {
    return splitPath.length ? [splitPath] : [];
  }
  const meta: { input?: unknown; type?: "query" } = {};
  if (typeof input !== "undefined") meta.input = input;
  if (type !== "any") meta.type = type;
  return [splitPath, meta];
}

export type InvalidateTargetArgs = {
  queryClient: QueryClient;
  target: TrpcInvalidationTarget;
  debug?: boolean;
};

/**
 * Apply a single invalidation target to the cache. Invalid or unknown targets
 * are ignored safely; this never throws.
 */
export function invalidateTarget(args: InvalidateTargetArgs): void {
  const { queryClient, target, debug } = args;

  try {
    switch (target?.scope) {
      case "all": {
        queryClient.invalidateQueries();
        return;
      }
      case "router": {
        queryClient.invalidateQueries({
          queryKey: buildQueryKey(target.path, undefined, "any"),
        });
        return;
      }
      case "procedure": {
        queryClient.invalidateQueries({
          queryKey: buildQueryKey(target.path, undefined, "query"),
        });
        return;
      }
      case "query": {
        queryClient.invalidateQueries({
          queryKey: buildQueryKey(target.path, target.input, "query"),
        });
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
