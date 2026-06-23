import type {
  LivePubSubAdapter,
  TrpcLiveInvalidationEvent,
} from "../../shared/types";

export type CreateMemoryPubSubOptions = {
  /** Receives errors thrown by a subscriber so one bad handler can't break others. */
  onError?: (error: unknown) => void;
};

type MemoryHandler = (event: TrpcLiveInvalidationEvent) => void;

/**
 * An in-process pub/sub adapter for local development and tests. Events are
 * delivered synchronously, in publish order, to every subscriber.
 */
export function createMemoryPubSub(
  options: CreateMemoryPubSubOptions = {},
): LivePubSubAdapter {
  const handlers = new Set<MemoryHandler>();

  return {
    async publish(event) {
      // Snapshot so (un)subscribing during delivery is safe.
      for (const handler of [...handlers]) {
        try {
          handler(event);
        } catch (error) {
          options.onError?.(error);
        }
      }
    },
    async subscribe(handler) {
      handlers.add(handler);
      return async () => {
        handlers.delete(handler);
      };
    },
  };
}
