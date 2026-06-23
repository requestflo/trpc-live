import { initTRPC } from "@trpc/server";
import { z } from "zod";

const t = initTRPC.create();

/**
 * Fixture router used by both runtime and type tests. A superset of the spec's
 * minimal example so the same router can drive batch / channel / mutation
 * scenarios as well as the documented type assertions.
 */
export const appRouter = t.router({
  response: t.router({
    list: t.procedure
      .input(z.object({ requestId: z.string() }))
      .query(() => [] as Array<{ id: string }>),

    byId: t.procedure
      .input(z.object({ responseId: z.string() }))
      .query(() => null),

    create: t.procedure
      .input(
        z.object({
          requestId: z.string(),
          organisationId: z.string(),
          payload: z.string(),
        }),
      )
      .mutation(() => ({ id: "res_1" })),
  }),

  request: t.router({
    byId: t.procedure
      .input(z.object({ requestId: z.string() }))
      .query(() => null),

    list: t.procedure
      .input(z.object({ organisationId: z.string() }))
      .query(() => [] as Array<{ id: string }>),
  }),

  dashboard: t.router({
    summary: t.procedure
      .input(z.object({ organisationId: z.string() }))
      .query(() => null),
  }),

  inbox: t.router({
    list: t.procedure
      .input(z.object({ organisationId: z.string() }))
      .query(() => [] as Array<{ id: string }>),
  }),

  system: t.router({
    status: t.procedure.query(() => ({ ok: true })),
  }),

  health: t.router({
    status: t.procedure.query(() => ({ ok: true })),
  }),
});

export type AppRouter = typeof appRouter;
