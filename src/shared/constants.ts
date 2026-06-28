import type { TrpcLiveEventType } from "./types";

/**
 * The event `type` carried in every payload. Clients use it to validate that a
 * subscription payload is actually an invalidation event.
 */
export const TRPC_LIVE_EVENT_TYPE: TrpcLiveEventType = "trpc.invalidate";

/**
 * Default dotted path of the subscription procedure the client subscribes to.
 * Mount the procedure at `live.invalidations` (or override `path`).
 */
export const DEFAULT_LIVE_PATH = "live.invalidations";

/** Prefix used when generating event ids. */
export const EVENT_ID_PREFIX = "evt_";
