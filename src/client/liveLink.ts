import { httpSubscriptionLink } from "@trpc/client";
import type { Operation, TRPCLink } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import type { QueryClient } from "@tanstack/react-query";
import { DEFAULT_LIVE_PATH } from "../shared/constants";
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
  /** Path of the invalidation subscription to open. Defaults to `live.invalidations`. */
  path?: string;
  /** Log ignored payloads / stream errors to the console. */
  debug?: boolean;
};

type ResultObserver = {
  next: (value: unknown) => void;
  error: (err: unknown) => void;
  complete: () => void;
};
type ResultObservable = {
  subscribe: (observer: Partial<ResultObserver>) => { unsubscribe: () => void };
};
type AnyOperationLink = (opts: {
  op: Operation;
  next: (op: Operation) => ResultObservable;
}) => ResultObservable;

export type OpenInvalidationStreamConfig = {
  queryClient: QueryClient;
  path?: string;
  debug?: boolean;
};

// httpSubscriptionLink is terminating, so it never calls `next`.
const TERMINATING_NEXT = (() => {
  throw new Error(
    "[trpc-live] the invalidation stream reached the end of the link chain",
  );
}) as never;

/**
 * Open one subscription through `operationLink` and apply the `trpc.invalidate`
 * events it streams to the QueryClient. Returns an `unsubscribe` handle.
 * Exported for advanced/manual use and testing.
 */
export function openInvalidationStream(
  operationLink: AnyOperationLink,
  config: OpenInvalidationStreamConfig,
): { unsubscribe: () => void } {
  const { queryClient, path = DEFAULT_LIVE_PATH, debug } = config;

  const op: Operation = {
    id: 0,
    type: "subscription",
    path,
    input: undefined,
    context: {},
    // No external abort: the stream lives for the client's lifetime.
    signal: undefined,
  };

  const result$ = operationLink({ op, next: TERMINATING_NEXT });

  return result$.subscribe({
    next(value) {
      // httpSubscriptionLink data envelopes carry a `data` field and no
      // lifecycle `type` ("state" | "started" | "stopped"); tracked events add
      // an `id`. `applyInvalidationEvent` re-validates, so non-invalidation
      // data is safely ignored.
      const result = (value as { result?: { type?: string; data?: unknown } })
        .result;
      if (result && result.type === undefined) {
        applyInvalidationEvent({
          queryClient,
          event: result.data,
          ...(debug !== undefined ? { debug } : {}),
        });
      }
    },
    error(err) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.warn("[trpc-live] invalidation stream error", err);
      }
    },
  });
}

function resolveEventSource(opts: HttpSubscriptionLinkOptions): unknown {
  return (
    (opts as { EventSource?: unknown }).EventSource ??
    (globalThis as { EventSource?: unknown }).EventSource
  );
}

/**
 * A drop-in replacement for tRPC's `httpSubscriptionLink`. It transports
 * subscriptions over SSE exactly like `httpSubscriptionLink`, and — when given
 * a `queryClient` — **opens and owns one invalidation subscription itself** as
 * soon as the client is created, applying `trpc.invalidate` events to the
 * TanStack Query cache. No provider, no `useSubscription`, no server helpers.
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
 * The invalidation connection is opened once and kept open for the client's
 * lifetime (`httpSubscriptionLink` reconnects automatically; nothing is
 * replayed on reconnect). With no `queryClient`, this is exactly
 * `httpSubscriptionLink`.
 */
export function liveLink<TRouter extends AnyRouter = AnyRouter>(
  opts: LiveLinkOptions,
): TRPCLink<TRouter> {
  const { queryClient, path = DEFAULT_LIVE_PATH, debug, ...httpOpts } = opts;
  const transportLink = httpSubscriptionLink(httpOpts) as unknown as TRPCLink<TRouter>;
  let opened = false;

  return (runtime) => {
    const operationLink = transportLink(runtime) as unknown as AnyOperationLink;

    // Open the single invalidation stream once, when the client is built.
    // Guarded so SSR (no EventSource) is a harmless no-op.
    if (
      queryClient &&
      !opened &&
      typeof resolveEventSource(httpOpts) === "function"
    ) {
      opened = true;
      try {
        openInvalidationStream(operationLink, {
          queryClient,
          path,
          ...(debug !== undefined ? { debug } : {}),
        });
      } catch (err) {
        opened = false;
        if (debug) {
          // eslint-disable-next-line no-console
          console.warn("[trpc-live] failed to open invalidation stream", err);
        }
      }
    }

    return operationLink as unknown as ReturnType<TRPCLink<TRouter>>;
  };
}
