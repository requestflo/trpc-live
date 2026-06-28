/**
 * Wire-format and cross-cutting types shared between the client link and the
 * server helpers. These are isomorphic (no React, Node, or tRPC runtime
 * dependencies) so they can be imported from anywhere.
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
 * The event streamed to clients over the tRPC `live` subscription. Plain and
 * untracked — there is no buffering or replay, so it carries no event-id
 * resume semantics beyond a unique `id` for logging/dedupe.
 */
export type TrpcLiveInvalidationEvent = {
  id: string;
  type: TrpcLiveEventType;
  targets: TrpcInvalidationTarget[];
  createdAt: string;
};

/** Input accepted by the hub's `publish()` and the proxy's `publish` callback. */
export type PublishInvalidationInput = {
  targets: TrpcInvalidationTarget[];
};
