import { Hono } from "hono";
import type { TrpcLiveServer } from "../types";

/**
 * Mount the live SSE endpoint on a Hono app.
 *
 * ```ts
 * app.route("/api/live", honoTrpcLiveAdapter(liveServer));
 * // exposes GET /api/live/sse
 * ```
 *
 * Authentication (`getUser`) and filtering (`canReceive`) are handled inside
 * the live server, so the route is intentionally thin.
 */
export function honoTrpcLiveAdapter(liveServer: TrpcLiveServer): Hono {
  const app = new Hono();
  app.get("/sse", (c) => liveServer.handleSse(c.req.raw));
  return app;
}
