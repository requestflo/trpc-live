import type {
  PublishInvalidationInput,
  TrpcInvalidationTarget,
} from "../shared/types";

/** Called once per published event. The return value is ignored. */
export type LivePublishFn = (input: PublishInvalidationInput) => unknown;

type BatchFrame = {
  targets: TrpcInvalidationTarget[];
};

export type InvalidationEngine = {
  /** Publish (or, inside a batch, collect) a single target. */
  emit: (target: TrpcInvalidationTarget) => Promise<void>;
  /** Run a callback, collecting every invalidation into a single event. */
  runBatch: <T>(callback: () => Promise<T>) => Promise<T>;
  /** Whether a batch is currently open. */
  isBatching: () => boolean;
};

/**
 * Turns proxy `.invalidate()` calls into published events, coalescing them into
 * one event when inside `batch()`.
 */
export function createInvalidationEngine(
  publish: LivePublishFn,
): InvalidationEngine {
  const stack: BatchFrame[] = [];

  async function emit(target: TrpcInvalidationTarget): Promise<void> {
    const frame = stack[stack.length - 1];
    if (frame) {
      frame.targets.push(target);
      return;
    }
    await publish({ targets: [target] });
  }

  async function runBatch<T>(callback: () => Promise<T>): Promise<T> {
    const frame: BatchFrame = { targets: [] };
    stack.push(frame);

    let result: T;
    try {
      result = await callback();
    } catch (error) {
      // Discard everything collected by this frame on failure.
      const idx = stack.indexOf(frame);
      if (idx >= 0) stack.splice(idx, 1);
      throw error;
    }

    const idx = stack.indexOf(frame);
    if (idx >= 0) stack.splice(idx, 1);

    const parent = stack[stack.length - 1];
    if (parent) {
      // Nested batch: bubble collected targets up to the parent frame.
      parent.targets.push(...frame.targets);
    } else if (frame.targets.length > 0) {
      await publish({ targets: frame.targets });
    }

    return result;
  }

  return { emit, runBatch, isBatching: () => stack.length > 0 };
}
