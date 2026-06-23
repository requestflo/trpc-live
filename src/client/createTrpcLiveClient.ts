import { TRPC_LIVE_EVENT_TYPE } from "../shared/constants";
import type {
  TrpcInvalidationTarget,
  TrpcLiveInvalidationEvent,
} from "../shared/types";
import { invalidateTarget } from "./invalidateTarget";
import type {
  EventSourceFactory,
  EventSourceLike,
  ReconnectOptions,
  TrpcLiveClient,
  TrpcLiveClientConfig,
  TrpcLiveStatus,
} from "./types";

export const DEFAULT_RECONNECT_OPTIONS: Required<ReconnectOptions> = {
  enabled: true,
  minDelayMs: 500,
  maxDelayMs: 5000,
  onReconnect: "invalidate-active",
};

const VALID_SCOPES = new Set(["query", "procedure", "router", "all"]);

function isValidTarget(value: unknown): value is TrpcInvalidationTarget {
  if (!value || typeof value !== "object") return false;
  const scope = (value as { scope?: unknown }).scope;
  if (typeof scope !== "string" || !VALID_SCOPES.has(scope)) return false;
  if (scope === "all") return true;
  return typeof (value as { path?: unknown }).path === "string";
}

/**
 * Validate and normalise a raw payload into a {@link TrpcLiveInvalidationEvent}.
 * Returns `null` for anything that isn't a well-formed invalidation event so
 * the caller can ignore it. Unknown targets are filtered out.
 */
export function parseInvalidationEvent(
  raw: unknown,
): TrpcLiveInvalidationEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== TRPC_LIVE_EVENT_TYPE) return null;
  if (!Array.isArray(obj.targets)) return null;

  const targets = obj.targets.filter(isValidTarget);

  const event: TrpcLiveInvalidationEvent = {
    id: typeof obj.id === "string" ? obj.id : "",
    type: TRPC_LIVE_EVENT_TYPE,
    targets,
    createdAt: typeof obj.createdAt === "string" ? obj.createdAt : "",
  };
  if (typeof obj.channel === "string") event.channel = obj.channel;
  if (typeof obj.actorId === "string") event.actorId = obj.actorId;
  if (typeof obj.skipActor === "boolean") event.skipActor = obj.skipActor;

  return event;
}

/**
 * Framework-agnostic SSE connection manager. Opens a single EventSource,
 * parses `trpc.invalidate` events, applies them to the cache, reconnects with
 * exponential backoff, and reports status to subscribers.
 */
export function createTrpcLiveClient(
  config: TrpcLiveClientConfig,
): TrpcLiveClient {
  const reconnectOptions: Required<ReconnectOptions> = {
    ...DEFAULT_RECONNECT_OPTIONS,
    ...(config.reconnect ?? {}),
  };

  let status: TrpcLiveStatus = { state: "idle", reconnectCount: 0 };
  const listeners = new Set<(status: TrpcLiveStatus) => void>();

  let source: EventSourceLike | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let started = false;
  let everConnected = false;

  function emitStatus(patch: Partial<TrpcLiveStatus>): void {
    status = { ...status, ...patch };
    for (const listener of listeners) listener(status);
    config.onStatusChange?.(status);
  }

  function debugLog(...args: unknown[]): void {
    if (config.debug) {
      // eslint-disable-next-line no-console
      console.warn("[trpc-live]", ...args);
    }
  }

  function resolveFactory(): EventSourceFactory | null {
    if (config.eventSourceFactory) return config.eventSourceFactory;
    const Global = (globalThis as { EventSource?: unknown }).EventSource;
    if (typeof Global === "function") {
      const Ctor = Global as new (
        url: string,
        init?: { withCredentials?: boolean },
      ) => EventSourceLike;
      return (url, init) => new Ctor(url, init);
    }
    return null;
  }

  function runReconnectBehaviour(): void {
    const mode = reconnectOptions.onReconnect;
    if (mode === "nothing") return;
    try {
      if (mode === "invalidate-all") {
        config.queryClient.invalidateQueries();
      } else {
        config.queryClient.invalidateQueries({ type: "active" });
      }
    } catch (error) {
      debugLog("onReconnect invalidation failed", error);
    }
  }

  function handleEvent(messageEvent: MessageEvent): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(messageEvent.data as string);
    } catch (error) {
      debugLog("failed to parse SSE payload", error);
      return;
    }

    const event = parseInvalidationEvent(parsed);
    if (!event) {
      debugLog("ignoring malformed event", parsed);
      return;
    }

    emitStatus({ lastEventAt: new Date() });
    config.onEvent?.(event);

    for (const target of event.targets) {
      invalidateTarget({
        trpc: config.trpc,
        queryClient: config.queryClient,
        target,
        ...(config.debug !== undefined ? { debug: config.debug } : {}),
      });
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function teardownSource(): void {
    if (source) {
      try {
        source.close();
      } catch {
        // ignore
      }
      source = null;
    }
  }

  function scheduleReconnect(): void {
    if (!started || !reconnectOptions.enabled || reconnectTimer) return;

    const delay = Math.min(
      reconnectOptions.maxDelayMs,
      reconnectOptions.minDelayMs * 2 ** attempt,
    );
    attempt += 1;
    emitStatus({ state: "reconnecting" });

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!started) return;
      open();
    }, delay);
  }

  function open(): void {
    const factory = resolveFactory();
    if (!factory) {
      emitStatus({
        state: "error",
        error: new Error(
          "[trpc-live] No EventSource implementation is available.",
        ),
      });
      return;
    }

    emitStatus({ state: everConnected ? "reconnecting" : "connecting" });

    let next: EventSourceLike;
    try {
      next = factory(config.url, {
        withCredentials: config.withCredentials ?? false,
      });
    } catch (error) {
      emitStatus({ state: "error", error });
      scheduleReconnect();
      return;
    }

    source = next;

    next.onopen = () => {
      const reconnected = everConnected;
      attempt = 0;
      everConnected = true;
      if (reconnected) {
        emitStatus({
          state: "connected",
          reconnectCount: status.reconnectCount + 1,
        });
        runReconnectBehaviour();
      } else {
        emitStatus({ state: "connected" });
      }
    };

    next.onerror = (event) => {
      // Take over reconnection from the native EventSource.
      teardownSource();
      if (!started) return;
      if (reconnectOptions.enabled) {
        scheduleReconnect();
      } else {
        emitStatus({ state: "error", error: event });
      }
    };

    next.addEventListener(TRPC_LIVE_EVENT_TYPE, handleEvent);
  }

  return {
    connect() {
      if (started) return;
      started = true;
      open();
    },
    close() {
      started = false;
      clearReconnectTimer();
      teardownSource();
      emitStatus({ state: "closed" });
    },
    getStatus() {
      return status;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
