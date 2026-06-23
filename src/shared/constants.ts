import type { TrpcLiveEventType } from "./types";

/**
 * The event `type` carried in every payload, and the SSE `event:` name the
 * server writes / the client listens for. Keeping these identical means a
 * client only has to register one named listener.
 */
export const TRPC_LIVE_EVENT_TYPE: TrpcLiveEventType = "trpc.invalidate";

/** Default Redis (and conceptual) channel used to fan events between processes. */
export const DEFAULT_PUBSUB_CHANNEL = "trpc-live:invalidations";

/** Prefix used when generating event ids. */
export const EVENT_ID_PREFIX = "evt_";
