import { expectAssignable } from "tsd";
import { httpSubscriptionLink, type TRPCLink } from "@trpc/client";
import { liveLink } from "../../src/client";
import type { AppRouter } from "../fixtures/appRouter";

// liveLink is a drop-in for httpSubscriptionLink: same options, produces a TRPCLink.
expectAssignable<TRPCLink<AppRouter>>(liveLink<AppRouter>({ url: "/api/trpc" }));

// It accepts the extra queryClient/path/debug options.
expectAssignable<TRPCLink<AppRouter>>(
  liveLink<AppRouter>({
    url: "/api/trpc",
    path: "live.invalidations",
    debug: true,
  }),
);

// Drop-in contract: every httpSubscriptionLink options object is also a valid
// liveLink options object (url, transformer, connectionParams, EventSource, …).
type HttpSubscriptionLinkOptions = Parameters<typeof httpSubscriptionLink>[0];
type LiveLinkOptionsArg = Parameters<typeof liveLink>[0];
expectAssignable<LiveLinkOptionsArg>({ url: "/api/trpc" } as HttpSubscriptionLinkOptions);
