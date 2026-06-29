# @requestflo/trpc-live

**A drop-in replacement for tRPC's [`httpSubscriptionLink`](https://trpc.io/docs/client/links/httpSubscriptionLink) that applies server-driven query invalidations to your TanStack Query cache.**

It's **just a client link**. Swap `httpSubscriptionLink` → `liveLink`, pass your `queryClient`, and the link opens **one** invalidation subscription by itself and keeps it open. Server `trpc.invalidate` events refetch the matching queries — your components keep using plain `useQuery` with **no `useSubscription`, no provider, no server helpers**.

```ts
import { liveLink } from "@requestflo/trpc-live";

splitLink({
  condition: (op) => op.type === "subscription",
  true: liveLink({ url: "/api/trpc", queryClient }), // was: httpSubscriptionLink({ url })
  false: httpBatchLink({ url: "/api/trpc" }),
});
```

---

## Does it just drop in, and is the SSE only once?

**Yes.** Verified by the test suite (`liveLink.test.ts`):

- tRPC builds links **eagerly** when you create the client, and `splitLink` builds its branches eagerly too. So the moment you call `createTRPCClient`, `liveLink` opens **exactly one** EventSource for the `live.invalidations` subscription. (The test asserts `MockEventSource.instances` has length **1**.)
- Your components use normal `trpc.x.useQuery(...)` — queries don't open SSE connections, so nothing else spins up. One tab → one SSE connection.
- With no `queryClient`, `liveLink` opens nothing and behaves exactly like `httpSubscriptionLink`.

> Note: any *other* tRPC subscriptions you run still get their own connection (that's standard `httpSubscriptionLink`). `liveLink` only auto-manages the single invalidation stream.

## How does it load the subscription and keep it open?

- **Load:** `liveLink` synthesizes one `subscription` operation for `path` (default `live.invalidations`) and subscribes to it the instant the tRPC client is constructed — before React even mounts. No `useSubscription` call is needed.
- **Keep open:** the connection lives for the lifetime of the tRPC client. `httpSubscriptionLink` reconnects automatically if it drops.
- **Leave / never duplicate:** an internal guard ensures it opens at most once per client. There is no teardown hook — the stream is meant to be always-on for the whole tab. (Nothing is replayed on reconnect; events missed while offline are lost by design.)

## Install

```bash
npm install @requestflo/trpc-live
```

Peer dependencies: `@trpc/client`, `@trpc/server`, `@tanstack/react-query`.

## React example

```tsx
// trpc.ts
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../server";
export const trpc = createTRPCReact<AppRouter>();
```

```tsx
// providers.tsx
"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, splitLink } from "@trpc/client";
import { liveLink } from "@requestflo/trpc-live";
import { trpc } from "./trpc";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        splitLink({
          condition: (op) => op.type === "subscription",
          // liveLink opens the one invalidation connection itself.
          true: liveLink({ url: "/api/trpc", queryClient }),
          false: httpBatchLink({ url: "/api/trpc" }),
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        {children}
      </trpc.Provider>
    </QueryClientProvider>
  );
}
```

```tsx
// any component — just a normal query, no subscription
function Responses({ requestId }: { requestId: string }) {
  const { data } = trpc.response.list.useQuery({ requestId });
  // Refetches automatically when the server invalidates response.list({ requestId }).
  return <List items={data ?? []} />;
}
```

## Server example (plain tRPC)

There are **no helpers to install** on the server. Stream `trpc.invalidate` events from a normal tRPC subscription mounted at `live.invalidations` (real-time delivery requires a server push — this is the irreducible minimum, and it's vanilla tRPC):

```ts
// server.ts
import { initTRPC } from "@trpc/server";
import { EventEmitter, on } from "node:events";
import { z } from "zod";
import { createEventId } from "@requestflo/trpc-live/shared";
import type { TrpcInvalidationTarget } from "@requestflo/trpc-live/shared";

const t = initTRPC.create();
const events = new EventEmitter();

/** Call from your mutations after writing data. */
export function invalidate(targets: TrpcInvalidationTarget[]) {
  events.emit("invalidate", {
    id: createEventId(),
    type: "trpc.invalidate" as const,
    targets,
    createdAt: new Date().toISOString(),
  });
}

export const appRouter = t.router({
  // The connection liveLink opens. Mount it at `live.invalidations`.
  live: t.router({
    invalidations: t.procedure.subscription(async function* ({ signal }) {
      for await (const [event] of on(events, "invalidate", { signal })) {
        yield event;
      }
    }),
  }),

  response: t.router({
    list: t.procedure
      .input(z.object({ requestId: z.string() }))
      .query(({ input }) => db.responses.byRequest(input.requestId)),

    create: t.procedure
      .input(z.object({ requestId: z.string(), body: z.string() }))
      .mutation(async ({ input }) => {
        const row = await db.responses.create(input);
        // Tell every connected tab to refetch response.list({ requestId }).
        invalidate([
          { scope: "query", path: "response.list", input: { requestId: input.requestId } },
        ]);
        return row;
      }),
  }),
});

export type AppRouter = typeof appRouter;
```

Use `protectedProcedure` for the subscription to control who may connect. For multiple server instances, emit into the `EventEmitter` from a shared source (e.g. Postgres `LISTEN/NOTIFY`); the package stays single-process by default.

## Invalidation targets

Each target says which slice of the cache to refetch — never any record data.

| Target | Invalidates |
| --- | --- |
| `{ scope: "query", path: "response.list", input: { requestId } }` | one exact cached query |
| `{ scope: "procedure", path: "response.list" }` | every cached variant of `response.list` |
| `{ scope: "router", path: "response" }` | everything under `response.*` |
| `{ scope: "all" }` | the entire tRPC cache |

Keys are built to match tRPC's own `getQueryKey`, so a `query` target hits exactly the entry `trpc.response.list.useQuery({ requestId })` registered.

## Security notes

Invalidation events are broadcast metadata, not a data channel. **Never put sensitive values in query inputs that may be broadcast.** Events carry only the procedure path, query input identifiers, an event id, and a timestamp — never tokens, secrets, or record contents.

## Limitations

- **Real-time delivery needs a server push.** A client link can't invent server events; you stream them from a normal tRPC subscription (no special server package required).
- **No durable delivery.** Events are fire-and-forget; nothing is buffered or replayed on reconnect.
- **Invalidation only.** The link tells clients which normal tRPC queries to refetch — it does not push data.

## API

### `@requestflo/trpc-live` (and `/client`)
- `liveLink(options)` — the drop-in for `httpSubscriptionLink` that auto-opens and applies the invalidation stream.
- `openInvalidationStream(operationLink, config)` — open/apply the stream manually (advanced).
- `invalidateTarget`, `applyInvalidationEvent`, `parseInvalidationEvent` — apply events to a `QueryClient` yourself.

### `@requestflo/trpc-live/shared`
- Types: `TrpcInvalidationTarget`, `TrpcLiveInvalidationEvent`, `TrpcInvalidationScope`.
- `createEventId`, `TRPC_LIVE_EVENT_TYPE`, `DEFAULT_LIVE_PATH` — for building events server-side.

## License

MIT
