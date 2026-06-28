import type { QueryClient } from "@tanstack/react-query";
import { TRPC_LIVE_EVENT_TYPE } from "../shared/constants";
import type {
  TrpcInvalidationTarget,
  TrpcLiveInvalidationEvent,
} from "../shared/types";
import { invalidateTarget } from "./invalidateTarget";

const VALID_SCOPES = new Set(["query", "procedure", "router", "all"]);

function isValidTarget(value: unknown): value is TrpcInvalidationTarget {
  if (!value || typeof value !== "object") return false;
  const scope = (value as { scope?: unknown }).scope;
  if (typeof scope !== "string" || !VALID_SCOPES.has(scope)) return false;
  if (scope === "all") return true;
  return typeof (value as { path?: unknown }).path === "string";
}

/**
 * Validate and normalise a raw subscription payload into a
 * {@link TrpcLiveInvalidationEvent}. Returns `null` for anything that isn't a
 * well-formed invalidation event; unknown targets are filtered out.
 */
export function parseInvalidationEvent(
  raw: unknown,
): TrpcLiveInvalidationEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== TRPC_LIVE_EVENT_TYPE) return null;
  if (!Array.isArray(obj.targets)) return null;

  return {
    id: typeof obj.id === "string" ? obj.id : "",
    type: TRPC_LIVE_EVENT_TYPE,
    targets: obj.targets.filter(isValidTarget),
    createdAt: typeof obj.createdAt === "string" ? obj.createdAt : "",
  };
}

export type ApplyInvalidationEventArgs = {
  queryClient: QueryClient;
  event: unknown;
  debug?: boolean;
};

/**
 * Validate a payload and apply each of its targets to the cache. Returns the
 * parsed event (so callers can observe it) or `null` if the payload was
 * ignored. Never throws.
 */
export function applyInvalidationEvent(
  args: ApplyInvalidationEventArgs,
): TrpcLiveInvalidationEvent | null {
  const event = parseInvalidationEvent(args.event);
  if (!event) {
    if (args.debug) {
      // eslint-disable-next-line no-console
      console.warn("[trpc-live] ignoring malformed event", args.event);
    }
    return null;
  }

  for (const target of event.targets) {
    invalidateTarget({
      queryClient: args.queryClient,
      target,
      ...(args.debug !== undefined ? { debug: args.debug } : {}),
    });
  }

  return event;
}
