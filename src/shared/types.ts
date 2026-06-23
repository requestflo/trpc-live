/**
 * Wire-format and cross-cutting types shared between the client, the server,
 * and the pub/sub adapters. These types are isomorphic (no React, Node, or
 * tRPC runtime dependencies) so they can be imported from anywhere.
 */

/** The discriminator literal for every live event this package emits. */
export type TrpcLiveEventType = "trpc.invalidate";

/** The kind of cache entry an invalidation target refers to. */
export type TrpcInvalidationScope = "query" | "procedure" | "router" | "all";

/**
 * A single instruction telling clients which slice of their tRPC/TanStack
 * Query cache to invalidate. Targets never carry record data — only the
 * information required to build a query key.
 */
export type TrpcInvalidationTarget =
  | {
      scope: "query";
      path: string;
      input: unknown;
    }
  | {
      scope: "procedure";
      path: string;
    }
  | {
      scope: "router";
      path: string;
    }
  | {
      scope: "all";
    };

/**
 * The event published over the pub/sub layer and streamed to clients via SSE.
 */
export type TrpcLiveInvalidationEvent = {
  id: string;
  type: TrpcLiveEventType;
  targets: TrpcInvalidationTarget[];
  createdAt: string;
  channel?: string;
  actorId?: string;
  /**
   * When true, the originating actor (identified by {@link actorId}) should
   * not receive this event back. Honoured by the live server when an actor
   * resolver is configured. Additive over the documented event shape.
   */
  skipActor?: boolean;
};

/**
 * Options accepted by every `.invalidate()` call on the backend proxy.
 *
 * - `channel` filters who should receive the event. When omitted the event is
 *   broadcast to all connected clients.
 * - `actorId` identifies who caused the invalidation.
 * - `skipActor` optionally prevents the originating actor from receiving it.
 */
export type LiveInvalidateOptions = {
  channel?: string;
  actorId?: string;
  skipActor?: boolean;
};

/**
 * Input accepted by `liveServer.publish()` and by the proxy's `publish`
 * callback. The server fills in `id`, `type`, and `createdAt`.
 */
export type PublishInvalidationInput = {
  targets: TrpcInvalidationTarget[];
  channel?: string;
  actorId?: string;
  skipActor?: boolean;
};

/**
 * Transport adapter contract. Implementations move events between the process
 * that publishes them and every process running a live SSE server.
 */
export type LivePubSubAdapter = {
  publish: (event: TrpcLiveInvalidationEvent) => Promise<void>;
  subscribe: (
    handler: (event: TrpcLiveInvalidationEvent) => void,
  ) => Promise<() => Promise<void>>;
};
