# @requestflo/trpc-live

**A drop-in replacement for tRPC's [`httpSubscriptionLink`](https://trpc.io/docs/client/links/httpSubscriptionLink) that applies server-driven query invalidations to your TanStack Query cache.**

It's **just a client link**. Swap `httpSubscriptionLink` → `liveLink`, pass your `queryClient`, and `trpc.invalidate` events streaming over your subscriptions automatically refetch the matching queries. No server helpers, no provider, no Redis, no pub/sub.

```ts
import { liveLink } from "@requestflo/trpc-live";

splitLink({
  condition: (op) => op.type === "subscription",
  true: liveLink({ url: "/api/trpc", queryClient }), // was: httpSubscriptionLink({ url })
  false: httpBatchLink({ url: "/api/trpc" }),
});
```

Your components keep using normal queries and refetch on their own:

```ts
const responses = trpc.response.list.useQuery({ requestId });
```

---

## Why a link?

`liveLink` is a normal tRPC link, so there's nothing special to mount on the server — that's the point. It wraps `httpSubscriptionLink` for transport and taps the subscription stream: any payload shaped like a `trpc.invalidate` event is applied to your `QueryClient` (with a key identical to the one `useQuery` registered). Everything else passes through untouched.

With no `queryClient`, `liveLink` behaves exactly like `httpSubscriptionLink`.

## Install

```bash
npm install @requestflo/trpc-live
# or: pnpm add @requestflo/trpc-live
```

Peer dependencies: `@trpc/client`, `@trpc/server`, and `@tanstack/react-query`.

## Client setup

`liveLink` accepts everything `httpSubscriptionLink` does, plus `queryClient` (and optional `path`, `debug`). Use it wherever you'd use `httpSubscriptionLink`:

```ts
import { createTRPCClient, httpBatchLink, splitLink } from "@trpc/client";
import { liveLink } from "@requestflo/trpc-live";
import { queryClient } from "./queryClient";
import type { AppRouter } from "./server";

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: liveLink({ url: "/api/trpc", queryClient }),
      false: httpBatchLink({ url: "/api/trpc" }),
    }),
  ],
});
```

By default `liveLink` applies invalidation events arriving on **any** subscription. To restrict it to a dedicated stream, pass `path`:

```ts
liveLink({ url: "/api/trpc", queryClient, path: "live.invalidations" });
```

## Server side: plain tRPC

There are **no helpers to install** on the server. Stream `trpc.invalidate` events from a normal tRPC subscription (real-time delivery requires a server push — this is the irreducible minimum, and it's vanilla tRPC):

```ts
import { EventEmitter, on } from "node:events";
import { createEventId } from "@requestflo/trpc-live/shared";
import type { TrpcInvalidationTarget } from "@requestflo/trpc-live/shared";

const events = new EventEmitter();

/** Call this from your mutations after writing data. */
export function invalidate(targets: TrpcInvalidationTarget[]) {
  events.emit("invalidate", {
    id: createEventId(),
    type: "trpc.invalidate" as const,
    targets,
    createdAt: new Date().toISOString(),
  });
}

export const appRouter = t.router({
  live: t.router({
    invalidations: t.procedure.subscription(async function* ({ signal }) {
      for await (const [event] of on(events, "invalidate", { signal })) {
        yield event;
      }
    }),
  }),
  // ...your queries and mutations
});
```

Then emit from a mutation:

```ts
create: t.procedure.input(schema).mutation(async ({ input }) => {
  const row = await db.response.create({ data: input });
  invalidate([
    { scope: "query", path: "response.list", input: { requestId: input.requestId } },
  ]);
  return row;
});
```

…and subscribe once on the client so the stream is open (standard tRPC):

```tsx
function LiveInvalidations() {
  trpc.live.invalidations.useSubscription(undefined);
  return null;
}
```

That's the whole server contract: a subscription that yields `{ type: "trpc.invalidate", targets }`. Use `protectedProcedure` to control who may connect.

## Invalidation targets

Each target tells clients which slice of the cache to refetch — never any record data.

| Target | Invalidates |
| --- | --- |
| `{ scope: "query", path: "response.list", input: { requestId } }` | one exact cached query |
| `{ scope: "procedure", path: "response.list" }` | every cached variant of `response.list` |
| `{ scope: "router", path: "response" }` | everything under `response.*` |
| `{ scope: "all" }` | the entire tRPC cache |

Keys are built to match tRPC's own `getQueryKey`, so a `query` target hits exactly the entry `trpc.response.list.useQuery({ requestId })` registered.

## Reconnect behaviour

`httpSubscriptionLink` reconnects automatically. This package does **nothing extra** on reconnect — there is no event buffer, so invalidations emitted while a client was offline are not replayed. Use TanStack Query's `refetchOnReconnect` / `refetchOnWindowFocus` if you need to recover.

## Security notes

Invalidation events are broadcast metadata, not a data channel. **Never put sensitive values in query inputs that may be broadcast.** Events carry only the procedure path, query input identifiers, an event id, and a timestamp — never tokens, secrets, or record contents.

## Limitations

- **Real-time delivery needs a server push.** A client link can't invent server events; you stream them from a normal tRPC subscription (no special server package required).
- **No durable delivery.** Events are fire-and-forget; nothing is buffered or replayed on reconnect.
- **Invalidation only.** The link tells clients which normal tRPC queries to refetch — it does not push data.

## API

### `@requestflo/trpc-live` (and `/client`)
- `liveLink(options)` — the drop-in for `httpSubscriptionLink` + auto-invalidation.
- `createLiveOperationLink(transport, config)` — the underlying tap (advanced).
- `invalidateTarget`, `applyInvalidationEvent`, `parseInvalidationEvent` — apply events to a `QueryClient` manually.

### `@requestflo/trpc-live/shared`
- Types: `TrpcInvalidationTarget`, `TrpcLiveInvalidationEvent`, `TrpcInvalidationScope`.
- `createEventId`, `TRPC_LIVE_EVENT_TYPE`, `DEFAULT_LIVE_PATH` — helpers for building events server-side.

## License

MIT
