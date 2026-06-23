import type {
  LiveInvalidateOptions,
  PublishInvalidationInput,
  TrpcInvalidationTarget,
} from "../shared/types";

/** Called once per published event group. The return value is ignored. */
export type LivePublishFn = (input: PublishInvalidationInput) => unknown;

export type CollectedInvalidation = {
  target: TrpcInvalidationTarget;
  options: LiveInvalidateOptions;
};

type BatchFrame = {
  defaults: LiveInvalidateOptions;
  entries: CollectedInvalidation[];
};

export type InvalidationEngine = {
  /** Publish (or, inside a batch, collect) a single target. */
  emit: (
    target: TrpcInvalidationTarget,
    options: LiveInvalidateOptions,
  ) => Promise<void>;
  /** Run a callback, collecting every invalidation into one (or per-channel) event. */
  runBatch: <T>(
    defaults: LiveInvalidateOptions,
    callback: () => Promise<T>,
  ) => Promise<T>;
  /** Whether a batch is currently open. */
  isBatching: () => boolean;
};

/** Merge per-invalidate options over batch defaults (per-invalidate wins). */
export function resolveOptions(
  defaults: LiveInvalidateOptions,
  override: LiveInvalidateOptions,
): LiveInvalidateOptions {
  const result: LiveInvalidateOptions = {};
  const channel = override.channel ?? defaults.channel;
  const actorId = override.actorId ?? defaults.actorId;
  const skipActor = override.skipActor ?? defaults.skipActor;
  if (channel !== undefined) result.channel = channel;
  if (actorId !== undefined) result.actorId = actorId;
  if (skipActor !== undefined) result.skipActor = skipActor;
  return result;
}

/** A stable key grouping entries that can share one event (same routing). */
function groupKey(options: LiveInvalidateOptions): string {
  return JSON.stringify({
    channel: options.channel ?? null,
    actorId: options.actorId ?? null,
    skipActor: options.skipActor ?? null,
  });
}

function buildPublishInput(
  entries: CollectedInvalidation[],
): PublishInvalidationInput {
  const options = entries[0]?.options ?? {};
  const input: PublishInvalidationInput = {
    targets: entries.map((entry) => entry.target),
  };
  if (options.channel !== undefined) input.channel = options.channel;
  if (options.actorId !== undefined) input.actorId = options.actorId;
  if (options.skipActor !== undefined) input.skipActor = options.skipActor;
  return input;
}

/**
 * The engine that turns proxy `.invalidate()` calls into published events,
 * batching them when inside `batch()`.
 */
export function createInvalidationEngine(
  publish: LivePublishFn,
): InvalidationEngine {
  const stack: BatchFrame[] = [];

  async function flush(entries: CollectedInvalidation[]): Promise<void> {
    if (entries.length === 0) return;

    // Group by effective routing so a per-invalidate channel override inside a
    // batch is delivered correctly. With no overrides this is a single event.
    const groups = new Map<string, CollectedInvalidation[]>();
    for (const entry of entries) {
      const key = groupKey(entry.options);
      const existing = groups.get(key);
      if (existing) existing.push(entry);
      else groups.set(key, [entry]);
    }

    for (const group of groups.values()) {
      await publish(buildPublishInput(group));
    }
  }

  async function emit(
    target: TrpcInvalidationTarget,
    options: LiveInvalidateOptions,
  ): Promise<void> {
    const frame = stack[stack.length - 1];
    if (frame) {
      frame.entries.push({
        target,
        options: resolveOptions(frame.defaults, options),
      });
      return;
    }
    await publish(buildPublishInput([{ target, options }]));
  }

  async function runBatch<T>(
    defaults: LiveInvalidateOptions,
    callback: () => Promise<T>,
  ): Promise<T> {
    const frame: BatchFrame = { defaults, entries: [] };
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
      // Nested batch: bubble already-resolved entries up to the parent frame.
      parent.entries.push(...frame.entries);
    } else {
      await flush(frame.entries);
    }

    return result;
  }

  return { emit, runBatch, isBatching: () => stack.length > 0 };
}
