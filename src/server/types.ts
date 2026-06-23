import type {
  AnyProcedure,
  AnyRouter,
  TRPCRouterRecord as RouterRecord,
  inferProcedureInput,
} from "@trpc/server";
import type {
  LiveInvalidateOptions,
  LivePubSubAdapter,
  PublishInvalidationInput,
  TrpcLiveInvalidationEvent,
} from "../shared/types";

export type { LiveInvalidateOptions } from "../shared/types";

/** Proxy node for a single procedure: `ctx.live.response.list`. */
export type LiveProcedureProxy<TInput> = {
  invalidate: (
    input?: TInput,
    options?: LiveInvalidateOptions,
  ) => Promise<void>;
};

/** Proxy node for a sub-router: `ctx.live.response`. */
export type LiveRouterProxy = {
  invalidate: (options?: LiveInvalidateOptions) => Promise<void>;
};

/**
 * Recursively decorate a tRPC {@link RouterRecord} so every procedure becomes a
 * {@link LiveProcedureProxy} and every sub-router becomes a {@link LiveRouterProxy}
 * that you can also drill further into. Mirrors tRPC's own inference walk.
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

/** Overloaded `batch` signature: optional leading options, then a callback. */
export type LiveBatch = {
  <T>(callback: () => Promise<T>): Promise<T>;
  <T>(options: LiveInvalidateOptions, callback: () => Promise<T>): Promise<T>;
};

/** The full backend proxy, typed from an `AppRouter`. */
export type LiveInvalidationProxy<TRouter extends AnyRouter> = {
  invalidate: (options?: LiveInvalidateOptions) => Promise<void>;
  batch: LiveBatch;
} & RouterProxy<TRouter>;

/** Options for {@link createLiveInvalidationProxy}. */
export type CreateLiveInvalidationProxyOptions = {
  /**
   * Forward a publish request to your transport. Usually wraps
   * `liveServer.publish(event)`. The return value is ignored.
   */
  publish: (input: PublishInvalidationInput) => unknown | Promise<unknown>;
};

/** Arguments passed to the live server's `canReceive` filter. */
export type CanReceiveArgs<TUser> = {
  user: TUser;
  event: TrpcLiveInvalidationEvent;
};

/** Options for {@link createTrpcLiveServer}. */
export type CreateTrpcLiveServerOptions<TUser = unknown> = {
  /** Transport used to fan events between processes. */
  pubsub: LivePubSubAdapter;
  /**
   * Resolve the user for an incoming SSE request. Return `null`/`undefined`
   * (or throw) to reject the connection with `401`. Omit to allow anonymous
   * connections.
   */
  getUser?: (
    request: Request,
  ) => TUser | null | undefined | Promise<TUser | null | undefined>;
  /**
   * Decide whether a connected user should receive an event. Defaults to a
   * global broadcast (every connection receives every event).
   */
  canReceive?: (args: CanReceiveArgs<TUser>) => boolean | Promise<boolean>;
  /**
   * Map a connected user to an actor id so `skipActor` can suppress echoing an
   * event back to its originator. Optional.
   */
  getActorId?: (user: TUser) => string | undefined | Promise<string | undefined>;
  /** Reports transport / streaming errors instead of throwing. */
  onError?: (error: unknown) => void;
  /**
   * Heartbeat comment interval in ms to keep idle connections open. Set to
   * `false` to disable. Defaults to 15000.
   */
  keepAliveMs?: number | false;
};

/** The live server returned by {@link createTrpcLiveServer}. */
export type TrpcLiveServer = {
  publish: (
    input: PublishInvalidationInput,
  ) => Promise<TrpcLiveInvalidationEvent>;
  handleSse: (request: Request) => Promise<Response>;
  /** Number of currently connected SSE clients. */
  readonly connectionCount: number;
  /** Tear down the shared subscription and close every connected client. */
  close: () => Promise<void>;
};
