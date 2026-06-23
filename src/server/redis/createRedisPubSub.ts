import { DEFAULT_PUBSUB_CHANNEL } from "../../shared/constants";
import type {
  LivePubSubAdapter,
  TrpcLiveInvalidationEvent,
} from "../../shared/types";

/** Minimal structural shape of a Redis publisher (e.g. an ioredis client). */
export type RedisPublisherLike = {
  publish: (channel: string, message: string) => unknown;
};

export type RedisMessageListener = (channel: string, message: string) => void;

/** Minimal structural shape of a Redis subscriber (e.g. an ioredis client). */
export type RedisSubscriberLike = {
  subscribe: (channel: string, ...args: unknown[]) => unknown;
  unsubscribe: (channel: string, ...args: unknown[]) => unknown;
  on: (event: "message", listener: RedisMessageListener) => unknown;
  off?: (event: "message", listener: RedisMessageListener) => unknown;
  removeListener?: (event: "message", listener: RedisMessageListener) => unknown;
};

export type CreateRedisPubSubOptions = {
  publisher: RedisPublisherLike;
  subscriber: RedisSubscriberLike;
  /** Channel name. Defaults to `trpc-live:invalidations`. */
  channel?: string;
  /** Receives JSON parse / delivery errors instead of throwing. */
  onError?: (error: unknown) => void;
};

/**
 * A Redis pub/sub adapter. Use separate publisher and subscriber connections —
 * a connection in subscriber mode cannot issue normal commands.
 *
 * ```ts
 * const pubsub = createRedisPubSub({
 *   publisher: redisPublisher,
 *   subscriber: redisSubscriber,
 *   channel: "trpc-live:invalidations",
 * });
 * ```
 */
export function createRedisPubSub(
  options: CreateRedisPubSubOptions,
): LivePubSubAdapter {
  const channel = options.channel ?? DEFAULT_PUBSUB_CHANNEL;
  const { publisher, subscriber, onError } = options;

  return {
    async publish(event) {
      await publisher.publish(channel, JSON.stringify(event));
    },
    async subscribe(handler) {
      const listener: RedisMessageListener = (incomingChannel, message) => {
        if (incomingChannel !== channel) return;
        let event: TrpcLiveInvalidationEvent;
        try {
          event = JSON.parse(message) as TrpcLiveInvalidationEvent;
        } catch (error) {
          onError?.(error);
          return;
        }
        handler(event);
      };

      subscriber.on("message", listener);
      await subscriber.subscribe(channel);

      return async () => {
        if (subscriber.off) subscriber.off("message", listener);
        else if (subscriber.removeListener) {
          subscriber.removeListener("message", listener);
        }
        await subscriber.unsubscribe(channel);
      };
    },
  };
}
