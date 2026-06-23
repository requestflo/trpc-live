import * as React from "react";
import type { TrpcLiveStatus } from "./types";

/** Holds the live connection status, provided by {@link TrpcLiveProvider}. */
export const TrpcLiveStatusContext = React.createContext<TrpcLiveStatus | null>(
  null,
);
