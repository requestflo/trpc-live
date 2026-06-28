import type { AnyRouter } from "@trpc/server";
import type {
  PublishInvalidationInput,
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

function resolvePublish(
  options: CreateLiveInvalidationProxyOptions,
): (input: PublishInvalidationInput) => unknown {
  if ("hub" in options) return (input) => options.hub.publish(input);
  return options.publish;
}

/**
 * Create the backend invalidation proxy. Mirrors the mental model of tRPC's
 * client-side `utils.*.invalidate()` helpers, but runs on the server and emits
 * events (via the hub) instead of touching a local cache.
 *
 * ```ts
 * const live = createLiveInvalidationProxy<AppRouter>({ hub });
 * await live.response.list.invalidate({ requestId });
 * ```
 */
export function createLiveInvalidationProxy<TRouter extends AnyRouter>(
  options: CreateLiveInvalidationProxyOptions,
): LiveInvalidationProxy<TRouter> {
  const publish = resolvePublish(options);
  const engine = createInvalidationEngine((input) => publish(input));

  function node(path: string[]): unknown {
    return new Proxy(PROXY_TARGET, {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        // Never let the proxy be mistaken for a thenable when awaited.
        if (prop === "then") return undefined;

        if (prop === "invalidate") {
          return (input?: unknown): Promise<void> => {
            // Root / router nodes take no input; procedure nodes take an
            // optional query input.
            if (path.length <= 1) {
              return engine.emit(targetForPath(path, false, undefined));
            }
            return engine.emit(targetForPath(path, input !== undefined, input));
          };
        }

        if (prop === "batch" && path.length === 0) {
          return (callback: () => Promise<unknown>): Promise<unknown> =>
            engine.runBatch(callback);
        }

        return node([...path, prop]);
      },
    });
  }

  return node([]) as LiveInvalidationProxy<TRouter>;
}
