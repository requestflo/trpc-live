import { expectAssignable } from "tsd";
import { initTRPC } from "@trpc/server";
import { httpSubscriptionLink, type TRPCLink } from "@trpc/client";
import { liveLink } from "../../src/client";
import { createLiveHub, createLiveProcedure } from "../../src/server";
import type { AppRouter } from "../fixtures/appRouter";

// liveLink is a drop-in for httpSubscriptionLink: same options, produces a TRPCLink.
expectAssignable<TRPCLink<AppRouter>>(liveLink<AppRouter>({ url: "/api/trpc" }));

// Drop-in contract: every httpSubscriptionLink options object is also a valid
// liveLink options object (url, transformer, connectionParams, EventSource, …).
type HttpSubscriptionLinkOptions = Parameters<typeof httpSubscriptionLink>[0];
type LiveLinkOptionsArg = Parameters<typeof liveLink>[0];
expectAssignable<LiveLinkOptionsArg>({ url: "/api/trpc" } as HttpSubscriptionLinkOptions);

// It accepts the extra queryClient/path/debug options.
expectAssignable<TRPCLink<AppRouter>>(
  liveLink<AppRouter>({
    url: "/api/trpc",
    path: "live.invalidations",
    debug: true,
  }),
);

// createLiveProcedure builds a procedure mountable in a router.
const t = initTRPC.create();
const hub = createLiveHub();

const liveRouter = t.router({
  invalidations: createLiveProcedure(hub, t.procedure),
});

expectAssignable<object>(liveRouter);
