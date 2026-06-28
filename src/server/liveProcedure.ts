import type { TrpcLiveInvalidationEvent } from "../shared/types";
import type { LiveHub } from "./hub";

/**
 * Bridge the hub to an async iterable suitable for a tRPC subscription
 * resolver. Yields each emitted event in order and cleans up (unsubscribes from
 * the hub) when the consumer's abort signal fires.
 *
 * ```ts
 * live: t.router({
 *   invalidations: t.procedure.subscription(({ signal }) =>
 *     liveInvalidations(hub, signal),
 *   ),
 * })
 * ```
 */
export function liveInvalidations(
  hub: LiveHub,
  signal?: AbortSignal,
): AsyncIterable<TrpcLiveInvalidationEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      const queue: TrpcLiveInvalidationEvent[] = [];
      let wake: (() => void) | null = null;

      const off = hub.subscribe((event) => {
        queue.push(event);
        wake?.();
        wake = null;
      });

      // `off()` runs no matter what happens after subscribing (including if
      // wiring up the abort listener throws), so the hub never leaks a listener.
      try {
        const onAbort = () => {
          wake?.();
          wake = null;
        };
        signal?.addEventListener("abort", onAbort);

        try {
          while (!signal?.aborted) {
            if (queue.length > 0) {
              yield queue.shift()!;
              continue;
            }
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          }
        } finally {
          signal?.removeEventListener("abort", onAbort);
        }
      } finally {
        off();
      }
    },
  };
}

/**
 * Convenience wrapper that builds a mountable subscription procedure from your
 * `t.procedure`:
 *
 * ```ts
 * const live = t.router({ invalidations: createLiveProcedure(hub, t.procedure) });
 * ```
 *
 * For full control (auth middleware, custom ctx, input), call
 * `t.procedure.subscription(({ signal }) => liveInvalidations(hub, signal))`
 * directly instead.
 */
export function createLiveProcedure<TProcedure>(
  hub: LiveHub,
  procedure: {
    subscription: (
      resolver: (opts: {
        signal: AbortSignal | undefined;
      }) => AsyncIterable<TrpcLiveInvalidationEvent>,
    ) => TProcedure;
  },
): TProcedure {
  return procedure.subscription((opts) => liveInvalidations(hub, opts.signal));
}
