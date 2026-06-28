import { httpSubscriptionLink } from "@trpc/client";
import type { Operation, TRPCLink } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { tap } from "@trpc/server/observable";
import type { QueryClient } from "@tanstack/react-query";
import { DEFAULT_LIVE_PATH } from "../shared/constants";
import { applyInvalidationEvent } from "./applyInvalidationEvent";

type HttpSubscriptionLinkOptions = Parameters<typeof httpSubscriptionLink>[0];

/**
 * Options for {@link liveLink}. A superset of `httpSubscriptionLink`'s options:
 * pass `queryClient` to enable automatic cache invalidation. With no
 * `queryClient` it behaves exactly like `httpSubscriptionLink`.
 */
export type LiveLinkOptions = HttpSubscriptionLinkOptions & {
  /** Applying invalidation events requires the QueryClient your app renders with. */
  queryClient?: QueryClient;
  /** Path of the invalidation subscription to tap. Defaults to `live.invalidations`. */
  path?: string;
  /** Log ignored payloads / errors to the console. */
  debug?: boolean;
};

type AnyOperationLink = (opts: {
  op: Operation;
  next: (op: Operation) => ReturnType<ReturnType<TRPCLink<AnyRouter>>>;
}) => ReturnType<ReturnType<TRPCLink<AnyRouter>>>;

export type CreateLiveOperationLinkConfig = {
  queryClient?: QueryClient;
  path?: string;
  debug?: boolean;
};

/**
 * Wrap a subscription transport operation-link so that data from the
 * invalidation subscription (at `path`) is applied to the QueryClient as it
 * streams. All other operations pass through untouched. Exported for testing.
 */
export function createLiveOperationLink(
  transport: AnyOperationLink,
  config: CreateLiveOperationLinkConfig,
): AnyOperationLink {
  const { queryClient, path = DEFAULT_LIVE_PATH, debug } = config;

  return ({ op, next }) => {
    const result$ = transport({ op, next });
    if (!queryClient || op.type !== "subscription" || op.path !== path) {
      return result$;
    }

    return result$.pipe(
      tap({
        next(envelope) {
          // httpSubscriptionLink data envelopes carry a `data` field and have
          // no lifecycle `type` ("state" | "started" | "stopped"); tracked
          // events additionally carry an `id`. Lifecycle messages (which have a
          // `type`) are ignored. `applyInvalidationEvent` re-validates the
          // payload, so non-invalidation data is safely dropped.
          const result = (
            envelope as { result?: { type?: string; data?: unknown } }
          ).result;
          if (result && result.type === undefined) {
            applyInvalidationEvent({
              queryClient,
              event: result.data,
              ...(debug !== undefined ? { debug } : {}),
            });
          }
        },
      }),
    );
  };
}

/**
 * A drop-in replacement for tRPC's `httpSubscriptionLink`. It transports
 * subscriptions over SSE exactly like `httpSubscriptionLink`, and — when given
 * a `queryClient` — automatically applies `trpc.invalidate` events from the
 * `live.invalidations` subscription to your TanStack Query cache.
 *
 * ```ts
 * createTRPCClient<AppRouter>({
 *   links: [
 *     splitLink({
 *       condition: (op) => op.type === "subscription",
 *       true: liveLink({ url: "/api/trpc", queryClient }),
 *       false: httpBatchLink({ url: "/api/trpc" }),
 *     }),
 *   ],
 * });
 * ```
 *
 * Run the invalidation subscription once (e.g.
 * `trpc.live.invalidations.useSubscription(undefined)`); this link applies the
 * events it carries. Reconnection is handled by `httpSubscriptionLink`; nothing
 * special happens on reconnect (events missed while offline are not replayed).
 */
export function liveLink<TRouter extends AnyRouter = AnyRouter>(
  opts: LiveLinkOptions,
): TRPCLink<TRouter> {
  const { queryClient, path = DEFAULT_LIVE_PATH, debug, ...httpOpts } = opts;
  const transportLink = httpSubscriptionLink(httpOpts) as unknown as TRPCLink<TRouter>;

  const config: CreateLiveOperationLinkConfig = { path };
  if (queryClient) config.queryClient = queryClient;
  if (debug !== undefined) config.debug = debug;

  return (runtime) =>
    createLiveOperationLink(
      transportLink(runtime) as unknown as AnyOperationLink,
      config,
    ) as unknown as ReturnType<TRPCLink<TRouter>>;
}
