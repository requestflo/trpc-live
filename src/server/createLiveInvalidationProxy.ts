import type { AnyRouter } from "@trpc/server";
import type {
  LiveInvalidateOptions,
  TrpcInvalidationTarget,
} from "../shared/types";
import { createInvalidationEngine } from "./batch";
import type {
  CreateLiveInvalidationProxyOptions,
  LiveInvalidationProxy,
} from "./types";

// A function target lets the recursive Proxy be probed with `typeof` safely.
const PROXY_TARGET = (): void => undefined;

/**
 * Decide the invalidation scope from the accumulated proxy path:
 * - `[]`            → all queries
 * - `[router]`      → router-wide
 * - `[a, b, ...]`   → a procedure; query-scoped when an input was supplied
 */
function targetForPath(
  path: string[],
  hasInput: boolean,
  input: unknown,
): TrpcInvalidationTarget {
  if (path.length === 0) return { scope: "all" };
  if (path.length === 1) return { scope: "router", path: path[0]! };
  const dotted = path.join(".");
  if (hasInput) return { scope: "query", path: dotted, input };
  return { scope: "procedure", path: dotted };
}

/**
 * Create the backend invalidation proxy. Mirrors the mental model of tRPC's
 * client-side `utils.*.invalidate()` helpers, but runs on the server and emits
 * events instead of touching a local cache.
 *
 * ```ts
 * const live = createLiveInvalidationProxy<AppRouter>({
 *   publish: (event) => liveServer.publish(event),
 * });
 *
 * await live.response.list.invalidate({ requestId });
 * ```
 */
export function createLiveInvalidationProxy<TRouter extends AnyRouter>(
  options: CreateLiveInvalidationProxyOptions,
): LiveInvalidationProxy<TRouter> {
  const engine = createInvalidationEngine((input) => options.publish(input));

  function node(path: string[]): unknown {
    return new Proxy(PROXY_TARGET, {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        // Never let the proxy be mistaken for a thenable when awaited.
        if (prop === "then") return undefined;

        if (prop === "invalidate") {
          return (a?: unknown, b?: unknown): Promise<void> => {
            // For root / router nodes the first arg is options; for procedure
            // nodes it is the (optional) query input.
            if (path.length <= 1) {
              return engine.emit(
                targetForPath(path, false, undefined),
                (a as LiveInvalidateOptions | undefined) ?? {},
              );
            }
            return engine.emit(
              targetForPath(path, a !== undefined, a),
              (b as LiveInvalidateOptions | undefined) ?? {},
            );
          };
        }

        if (prop === "batch" && path.length === 0) {
          return (a?: unknown, b?: unknown): Promise<unknown> => {
            if (typeof a === "function") {
              return engine.runBatch({}, a as () => Promise<unknown>);
            }
            return engine.runBatch(
              (a as LiveInvalidateOptions | undefined) ?? {},
              (b as (() => Promise<unknown>) | undefined) ??
                (async () => undefined),
            );
          };
        }

        return node([...path, prop]);
      },
    });
  }

  return node([]) as LiveInvalidationProxy<TRouter>;
}
