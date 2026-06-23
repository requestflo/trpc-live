import { TRPC_LIVE_EVENT_TYPE } from "../shared/constants";
import { createEventId } from "../shared/ids";
import type {
  PublishInvalidationInput,
  TrpcLiveInvalidationEvent,
} from "../shared/types";

export type CreateInvalidationEventOptions = {
  /** Override the generated id (e.g. for deterministic tests). */
  id?: string;
  /** Override the generated ISO timestamp. */
  createdAt?: string;
};

/**
 * Turn a {@link PublishInvalidationInput} into a fully-formed
 * {@link TrpcLiveInvalidationEvent}, filling in `id`, `type`, and `createdAt`.
 *
 * Throws when there are no targets — an empty event would do nothing and almost
 * always signals a bug.
 */
export function createInvalidationEvent(
  input: PublishInvalidationInput,
  options: CreateInvalidationEventOptions = {},
): TrpcLiveInvalidationEvent {
  if (!Array.isArray(input.targets) || input.targets.length === 0) {
    throw new Error(
      "[trpc-live] Cannot publish an invalidation event with no targets.",
    );
  }

  const event: TrpcLiveInvalidationEvent = {
    id: options.id ?? createEventId(),
    type: TRPC_LIVE_EVENT_TYPE,
    targets: input.targets,
    createdAt: options.createdAt ?? new Date().toISOString(),
  };

  if (input.channel !== undefined) event.channel = input.channel;
  if (input.actorId !== undefined) event.actorId = input.actorId;
  if (input.skipActor !== undefined) event.skipActor = input.skipActor;

  return event;
}
