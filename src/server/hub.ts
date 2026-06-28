import { TRPC_LIVE_EVENT_TYPE } from "../shared/constants";
import { createEventId } from "../shared/ids";
import type {
  PublishInvalidationInput,
  TrpcLiveInvalidationEvent,
} from "../shared/types";

export type LiveInvalidationListener = (
  event: TrpcLiveInvalidationEvent,
) => void;

/**
 * A single-process event hub: the wiring between mutations (which `publish`
 * invalidations) and the live subscription (which `subscribe`s and yields them
 * to connected clients).
 *
 * This is deliberately just a `Set` of listeners — no Redis, no cross-process
 * fan-out, no buffering or replay. One hub per server process.
 */
export type LiveHub = {
  /** Notify every current subscriber with a fully-formed event. */
  emit: (event: TrpcLiveInvalidationEvent) => void;
  /** Build an event from targets (fills id/type/createdAt) and emit it. */
  publish: (input: PublishInvalidationInput) => TrpcLiveInvalidationEvent;
  /** Register a listener; returns an unsubscribe function. */
  subscribe: (listener: LiveInvalidationListener) => () => void;
  /** Number of active listeners (useful for tests/metrics). */
  readonly listenerCount: number;
};

export type CreateLiveHubOptions = {
  /** Receives errors thrown by a listener so one bad handler can't break others. */
  onError?: (error: unknown) => void;
};

export function createLiveHub(options: CreateLiveHubOptions = {}): LiveHub {
  const listeners = new Set<LiveInvalidationListener>();

  function emit(event: TrpcLiveInvalidationEvent): void {
    // Snapshot so (un)subscribing during delivery is safe.
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        options.onError?.(error);
      }
    }
  }

  function publish(input: PublishInvalidationInput): TrpcLiveInvalidationEvent {
    if (!Array.isArray(input.targets) || input.targets.length === 0) {
      throw new Error(
        "[trpc-live] Cannot publish an invalidation event with no targets.",
      );
    }
    const event: TrpcLiveInvalidationEvent = {
      id: createEventId(),
      type: TRPC_LIVE_EVENT_TYPE,
      targets: input.targets,
      createdAt: new Date().toISOString(),
    };
    emit(event);
    return event;
  }

  function subscribe(listener: LiveInvalidationListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    emit,
    publish,
    subscribe,
    get listenerCount() {
      return listeners.size;
    },
  };
}
