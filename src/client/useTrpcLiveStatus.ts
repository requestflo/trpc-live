import * as React from "react";
import { TrpcLiveStatusContext } from "./context";
import type { TrpcLiveStatus } from "./types";

/**
 * Read the live SSE connection status. Must be used inside a
 * {@link TrpcLiveProvider}.
 *
 * ```ts
 * const status = useTrpcLiveStatus();
 * if (status.state === "connected") { ... }
 * ```
 */
export function useTrpcLiveStatus(): TrpcLiveStatus {
  const status = React.useContext(TrpcLiveStatusContext);
  if (status === null) {
    throw new Error(
      "[trpc-live] useTrpcLiveStatus must be used within a <TrpcLiveProvider>.",
    );
  }
  return status;
}
