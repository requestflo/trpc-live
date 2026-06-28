import { httpSubscriptionLink } from "@trpc/client";
import type { Operation, TRPCLink } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { tap } from "@trpc/server/observable";
import type { QueryClient } from "@tanstack/react-query";
import { applyInvalidationEvent } from "./applyInvalidationEvent";

type HttpSubscriptionLinkOptions = Parameters<typeof httpSubscriptionLink>[0];

/**
 * Options for {@link liveLink}. A superset of `httpSubscriptionLink`'s options
 * (`url`, `transformer`, `connectionParams`, `EventSource`, …): pass
 * `queryClient` to enable automatic cache invalidation. With no `queryClient`
 * it behaves exactly like `httpSubscriptionLink`.
 */
export type LiveLinkOptions = HttpSubscriptionLinkOptions & {
  /** The QueryClient your app renders with. Required to apply invalidations. */
  queryClient?: QueryClient;
  /**
   * Restrict invalidation to a single subscription path (e.g.
   * `"live.invalidations"`). Omit to apply `trpc.invalidate` events arriving on
   * any subscription.
   */
  path?: string;
  /** Log ignored payloads to the console. */
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
 * Wrap a subscription transport operation-link so that `trpc.invalidate` events
 * streaming over a subscription are applied to the QueryClient. All operation
 * data still passes through untouched. Exported for testing.
 */
export function createLiveOperationLink(
  transport: AnyOperationLink,
  config: CreateLiveOperationLinkConfig,
): AnyOperationLink {
  const { queryClient, path, debug } = config;

  return ({ op, next }) => {
    const result$ = transport({ op, next });

    const shouldTap =
      !!queryClient &&
      op.type === "subscription" &&
      (path === undefined || op.path === path);
    if (!shouldTap) return result$;

    return result$.pipe(
      tap({
        next(envelope) {
          // httpSubscriptionLink data envelopes carry a `data` field and no
          // lifecycle `type` ("state" | "started" | "stopped"); tracked events
          // additionally carry an `id`. Lifecycle messages are skipped, and
          // `applyInvalidationEvent` re-validates so non-invalidation data is
          // safely ignored.
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
 * a `queryClient` — applies `trpc.invalidate` events streaming over your
 * subscriptions to the TanStack Query cache. No server helpers, no provider:
 * the link does the work.
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
 * Reconnection is handled by `httpSubscriptionLink`; nothing special happens on
 * reconnect (events missed while offline are not replayed).
 */
export function liveLink<TRouter extends AnyRouter = AnyRouter>(
  opts: LiveLinkOptions,
): TRPCLink<TRouter> {
  const { queryClient, path, debug, ...httpOpts } = opts;
  const transportLink = httpSubscriptionLink(httpOpts) as unknown as TRPCLink<TRouter>;

  const config: CreateLiveOperationLinkConfig = {};
  if (queryClient) config.queryClient = queryClient;
  if (path !== undefined) config.path = path;
  if (debug !== undefined) config.debug = debug;

  return (runtime) =>
    createLiveOperationLink(
      transportLink(runtime) as unknown as AnyOperationLink,
      config,
    ) as unknown as ReturnType<TRPCLink<TRouter>>;
}
