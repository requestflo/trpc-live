import type { QueryClient } from "@tanstack/react-query";
import type { TrpcLiveInvalidationEvent } from "../shared/types";

/** Listener invoked with each valid event before it is applied to the cache. */
export type TrpcLiveInvalidationEventListener = (
  event: TrpcLiveInvalidationEvent,
) => void;

/** What to do with the cache after a dropped connection is re-established. */
export type ReconnectBehaviour = "nothing" | "invalidate-active" | "invalidate-all";

export type ReconnectOptions = {
  enabled?: boolean;
  minDelayMs?: number;
  maxDelayMs?: number;
  onReconnect?: ReconnectBehaviour;
};

export type TrpcLiveStatusState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

export type TrpcLiveStatus = {
  state: TrpcLiveStatusState;
  reconnectCount: number;
  lastEventAt?: Date;
  error?: unknown;
};

/** Minimal structural subset of the DOM `EventSource` this package relies on. */
export interface EventSourceLike {
  readyState: number;
  close(): void;
  addEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
  ): void;
  removeEventListener?(
    type: string,
    listener: (event: MessageEvent) => void,
  ): void;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
}

export type EventSourceInit = {
  withCredentials?: boolean;
};

/** Creates an `EventSource` (or compatible). Injectable for tests / custom transports. */
export type EventSourceFactory = (
  url: string,
  init?: EventSourceInit,
) => EventSourceLike;

/** Config for the framework-agnostic connection manager. */
export type TrpcLiveClientConfig = {
  url: string;
  /** The `createTRPCReact()` proxy. Used to resolve paths to query keys. */
  trpc: unknown;
  queryClient: QueryClient;
  reconnect?: ReconnectOptions;
  eventSourceFactory?: EventSourceFactory;
  withCredentials?: boolean;
  debug?: boolean;
  onStatusChange?: (status: TrpcLiveStatus) => void;
  onEvent?: (event: TrpcLiveInvalidationEvent) => void;
};

export type TrpcLiveClient = {
  /** Open the connection. Idempotent while already connected. */
  connect: () => void;
  /** Permanently close the connection and stop reconnecting. */
  close: () => void;
  getStatus: () => TrpcLiveStatus;
  subscribe: (listener: (status: TrpcLiveStatus) => void) => () => void;
};

export type TrpcLiveProviderProps = {
  /** Your `createTRPCReact<AppRouter>()` proxy. */
  trpc: unknown;
  /** The same `QueryClient` your app renders with. */
  queryClient: QueryClient;
  /** URL of the SSE endpoint, e.g. `/api/live/sse`. */
  url: string;
  reconnect?: ReconnectOptions;
  /** Send credentials (cookies) with the SSE request. */
  withCredentials?: boolean;
  /** Inject a custom `EventSource` implementation (tests, polyfills, RSC). */
  eventSourceFactory?: EventSourceFactory;
  /** Log resolution / parse issues to the console. */
  debug?: boolean;
  /** Observe every valid event before it is applied to the cache. */
  onEvent?: (event: TrpcLiveInvalidationEvent) => void;
  children?: React.ReactNode;
};
