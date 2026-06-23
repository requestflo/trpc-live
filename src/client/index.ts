"use client";

export { TrpcLiveProvider } from "./TrpcLiveProvider";
export { useTrpcLiveStatus } from "./useTrpcLiveStatus";
export {
  createTrpcLiveClient,
  parseInvalidationEvent,
  DEFAULT_RECONNECT_OPTIONS,
} from "./createTrpcLiveClient";
export { resolveTrpcPath } from "./resolveTrpcPath";
export { invalidateTarget } from "./invalidateTarget";
export type { InvalidateTargetArgs } from "./invalidateTarget";

export type {
  ReconnectOptions,
  ReconnectBehaviour,
  TrpcLiveStatus,
  TrpcLiveStatusState,
  TrpcLiveProviderProps,
  TrpcLiveInvalidationEventListener,
  TrpcLiveClient,
  TrpcLiveClientConfig,
  EventSourceLike,
  EventSourceFactory,
  EventSourceInit,
} from "./types";

export type {
  TrpcInvalidationTarget,
  TrpcInvalidationScope,
  TrpcLiveInvalidationEvent,
} from "../shared/types";

export { TRPC_LIVE_EVENT_TYPE } from "../shared/constants";
