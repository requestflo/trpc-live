import type {
  AnyProcedure,
  AnyRouter,
  TRPCRouterRecord as RouterRecord,
  inferProcedureInput,
} from "@trpc/server";
import type { PublishInvalidationInput } from "../shared/types";
import type { LiveHub } from "./hub";

/** Proxy node for a single procedure: `ctx.live.response.list`. */
export type LiveProcedureProxy<TInput> = {
  invalidate: (input?: TInput) => Promise<void>;
};

/** Proxy node for a sub-router: `ctx.live.response`. */
export type LiveRouterProxy = {
  invalidate: () => Promise<void>;
};

/**
 * Recursively decorate a tRPC {@link RouterRecord} so every procedure becomes a
 * {@link LiveProcedureProxy} and every sub-router becomes a {@link LiveRouterProxy}
 * you can also drill further into. Mirrors tRPC's own inference walk.
 */
type LiveRecordProxy<TRecord extends RouterRecord> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyProcedure
      ? LiveProcedureProxy<inferProcedureInput<$Value>>
      : $Value extends RouterRecord
        ? LiveRouterProxy & LiveRecordProxy<$Value>
        : never
    : never;
};

/** The router portion of the proxy, derived from an `AppRouter` type. */
export type RouterProxy<TRouter extends AnyRouter> = LiveRecordProxy<
  TRouter["_def"]["record"]
>;

/** Coalesce multiple invalidations inside the callback into one event. */
export type LiveBatch = <T>(callback: () => Promise<T>) => Promise<T>;

/** The full backend proxy, typed from an `AppRouter`. */
export type LiveInvalidationProxy<TRouter extends AnyRouter> = {
  invalidate: () => Promise<void>;
  batch: LiveBatch;
} & RouterProxy<TRouter>;

/**
 * Options for {@link createLiveInvalidationProxy}. Provide a {@link LiveHub}
 * (recommended) or a raw `publish` callback for custom transports/tests.
 */
export type CreateLiveInvalidationProxyOptions =
  | { hub: LiveHub }
  | { publish: (input: PublishInvalidationInput) => unknown | Promise<unknown> };
