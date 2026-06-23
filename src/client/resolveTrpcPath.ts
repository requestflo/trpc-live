/**
 * Resolve a dot-separated path (e.g. `"response.list"`) against the tRPC proxy,
 * returning the proxy node at that path (`trpc.response.list`).
 *
 * Navigation is permissive: for the real tRPC proxy every segment yields a
 * sub-proxy, and for a plain object a missing segment yields `undefined`.
 * Unknown paths are therefore ignored safely — this never throws.
 */
export function resolveTrpcPath(trpc: unknown, path: string): unknown {
  if (trpc == null || typeof path !== "string" || path.length === 0) {
    return undefined;
  }

  let node: unknown = trpc;
  for (const segment of path.split(".")) {
    if (node == null) return undefined;
    if (typeof node !== "object" && typeof node !== "function") {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }

  return node;
}
