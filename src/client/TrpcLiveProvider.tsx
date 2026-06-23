"use client";

import * as React from "react";
import { createTrpcLiveClient } from "./createTrpcLiveClient";
import { TrpcLiveStatusContext } from "./context";
import type {
  TrpcLiveInvalidationEventListener,
  TrpcLiveProviderProps,
  TrpcLiveStatus,
} from "./types";

const INITIAL_STATUS: TrpcLiveStatus = { state: "idle", reconnectCount: 0 };

/**
 * Opens a single shared SSE connection and applies server-driven invalidations
 * to your TanStack Query cache. Frontend code keeps using normal tRPC queries.
 *
 * ```tsx
 * <TrpcLiveProvider trpc={trpc} queryClient={queryClient} url="/api/live/sse">
 *   <App />
 * </TrpcLiveProvider>
 * ```
 */
export function TrpcLiveProvider(props: TrpcLiveProviderProps): React.ReactElement {
  const {
    trpc,
    queryClient,
    url,
    reconnect,
    withCredentials,
    eventSourceFactory,
    debug,
    onEvent,
    children,
  } = props;

  const [status, setStatus] = React.useState<TrpcLiveStatus>(INITIAL_STATUS);

  // Keep the latest values without forcing the connection effect to re-run.
  const latest = React.useRef({
    trpc,
    queryClient,
    reconnect,
    eventSourceFactory,
    debug,
    onEvent: onEvent as TrpcLiveInvalidationEventListener | undefined,
  });
  latest.current = {
    trpc,
    queryClient,
    reconnect,
    eventSourceFactory,
    debug,
    onEvent: onEvent as TrpcLiveInvalidationEventListener | undefined,
  };

  React.useEffect(() => {
    const current = latest.current;
    const client = createTrpcLiveClient({
      url,
      trpc: current.trpc,
      queryClient: current.queryClient,
      onStatusChange: setStatus,
      onEvent: (event) => latest.current.onEvent?.(event),
      ...(current.reconnect !== undefined ? { reconnect: current.reconnect } : {}),
      ...(current.eventSourceFactory !== undefined
        ? { eventSourceFactory: current.eventSourceFactory }
        : {}),
      ...(withCredentials !== undefined ? { withCredentials } : {}),
      ...(current.debug !== undefined ? { debug: current.debug } : {}),
    });

    client.connect();
    return () => client.close();
    // Connection identity is defined by the URL (and credentials mode). Other
    // inputs are read from the ref so re-renders don't reopen the connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, withCredentials]);

  return (
    <TrpcLiveStatusContext.Provider value={status}>
      {children}
    </TrpcLiveStatusContext.Provider>
  );
}
