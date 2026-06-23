import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "./appRouter";

/**
 * The `trpc` proxy passed to `TrpcLiveProvider`. Navigating it (e.g.
 * `trpc.response.list`) yields nodes that `getQueryKey` understands.
 */
export const trpc: CreateTRPCReact<AppRouter, unknown> =
  createTRPCReact<AppRouter>();
