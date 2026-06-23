import { EVENT_ID_PREFIX } from "./constants";

/**
 * Generate a unique, sortable-ish event id of the form `evt_<random>`.
 *
 * Prefers the platform `crypto.randomUUID()` when available (Node 19+, modern
 * browsers, edge runtimes) and falls back to a timestamp + random suffix so the
 * package works in any JavaScript environment.
 */
export function createEventId(): string {
  const cryptoObj =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as Crypto | undefined)
      : undefined;

  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `${EVENT_ID_PREFIX}${cryptoObj.randomUUID()}`;
  }

  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 12);
  return `${EVENT_ID_PREFIX}${time}_${rand}`;
}
