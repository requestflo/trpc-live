# @requestflo/trpc-live

**A drop-in replacement for tRPC's [`httpSubscriptionLink`](https://trpc.io/docs/client/links/httpSubscriptionLink) that also applies server-driven query invalidations to your TanStack Query cache.**

Swap the link, pass your `queryClient`, and a single live subscription keeps every connected browser's cache fresh — your components keep using normal `trpc.useQuery`.

```ts
// client: liveLink is a drop-in for httpSubscriptionLink
import { liveLink } from "@requestflo/trpc-live/client";

splitLink({
  condition: (op) => op.type === "subscription",
  true: liveLink({ url: "/api/trpc", queryClient }), // was: httpSubscriptionLink({ url })
  false: httpBatchLink({ url: "/api/trpc" }),
});
```

```ts
// server: emit invalidations from a mutation
await ctx.live.response.list.invalidate({ requestId });
```

No Redis. No pub/sub. No bespoke SSE server. One subscription, delivered over tRPC's own transport.

---

## How it works

1. A backend mutation calls `ctx.live.<router>.<procedure>.invalidate(input?)`.
2. That pushes a tiny **invalidation event** (procedure path + query input — never record data) into an in-process **hub**.
3. The hub feeds a normal tRPC **subscription** (`live.invalidations`) that streams events to connected clients over a single SSE connection.
4. On the client, **`liveLink`** (your drop-in for `httpSubscriptionLink`) taps that subscription's data and calls `queryClient.invalidateQueries(...)` with a key identical to the one `useQuery` registered.

Single process only (no cross-instance fan-out). Events are fire-and-forget: nothing is buffered or replayed.

## Install

```bash
npm install @requestflo/trpc-live
# or: pnpm add @requestflo/trpc-live
```

Peer dependencies: `@trpc/client`, `@trpc/server`, and `@tanstack/react-query` (all v11 / v5).

## Client setup

`liveLink` accepts everything `httpSubscriptionLink` does, plus a `queryClient` (and optional `path`, `debug`). Use it wherever you use `httpSubscriptionLink`:

```ts
import { createTRPCClient, httpBatchLink, splitLink } from "@trpc/client";
import { liveLink } from "@requestflo/trpc-live/client";
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

Then open the invalidation subscription **once**, near the root of your app, so events flow through `liveLink`:

```tsx
function LiveInvalidations() {
  trpc.live.invalidations.useSubscription(undefined);
  return null;
}
```

That's it. Components keep using normal queries and refetch automatically:

```ts
const responses = trpc.response.list.useQuery({ requestId });
const dashboard = trpc.dashboard.summary.useQuery({ organisationId });
```

> With no `queryClient`, `liveLink` behaves exactly like `httpSubscriptionLink`.

## Server setup

Wire a hub to a subscription procedure and an invalidation proxy:

```ts
import {
  createLiveHub,
  createLiveProcedure,
  createLiveInvalidationProxy,
} from "@requestflo/trpc-live/server";
import type { AppRouter } from "./router";

export const liveHub = createLiveHub();

// Mount the subscription your client subscribes to.
export const liveRouter = t.router({
  invalidations: createLiveProcedure(liveHub, t.procedure),
});

// Typed invalidation proxy for your context.
export const live = createLiveInvalidationProxy<AppRouter>({ hub: liveHub });

export async function createContext() {
  return { prisma, live };
}
```

`createLiveProcedure` is a convenience over the underlying helper — for full control (auth middleware, custom ctx) call it yourself:

```ts
invalidations: t.procedure.subscription(({ signal }) =>
  liveInvalidations(liveHub, signal),
),
```

## Invalidation API

The backend proxy mirrors tRPC's client-side `utils.*.invalidate()` helpers and is fully typed from your `AppRouter`.

| Call | Scope | Effect |
| --- | --- | --- |
| `ctx.live.response.list.invalidate({ requestId })` | query | One exact cached query |
| `ctx.live.response.list.invalidate()` | procedure | Every cached variant of `response.list` |
| `ctx.live.response.invalidate()` | router | Everything under `response.*` |
| `ctx.live.invalidate()` | all | The entire tRPC cache |

TypeScript autocompletes valid paths/inputs and rejects invalid ones:

```ts
ctx.live.fake.router.invalidate();           // ❌ type error
ctx.live.response.list.invalidate({ x: 1 }); // ❌ type error (wrong input)
ctx.live.health.status.invalidate();          // ✅ void-input procedure
```

## Batch

Coalesce several invalidations into a single event:

```ts
await ctx.live.batch(async () => {
  await ctx.live.response.list.invalidate({ requestId });
  await ctx.live.dashboard.summary.invalidate({ organisationId });
  await ctx.live.inbox.list.invalidate({ organisationId });
});
```

The batch collects every target inside the callback, publishes **one** event on success, returns the callback's result, and discards everything if it throws.

## Example: a mutation

```ts
create: protectedProcedure
  .input(createResponseSchema)
  .mutation(async ({ ctx, input }) => {
    const response = await ctx.prisma.response.create({ data: input });

    await ctx.live.batch(async () => {
      await ctx.live.response.list.invalidate({ requestId: input.requestId });
      await ctx.live.inbox.list.invalidate({ organisationId: input.organisationId });
      await ctx.live.dashboard.summary.invalidate({ organisationId: input.organisationId });
    });

    return response;
  });
```

## Reconnect behaviour

`httpSubscriptionLink` reconnects automatically. This package does **nothing extra** on reconnect — there is no event buffer, so invalidations emitted while a client was disconnected are not replayed. If you need stronger guarantees, refetch on focus/reconnect with TanStack Query's built-in options.

## Security notes

Invalidation events are broadcast metadata, not a data channel. **Never put sensitive values in query inputs that may be broadcast.** Events contain only the procedure path, query input identifiers, an event id, and a timestamp — never tokens, secrets, or record contents.

The `live.invalidations` subscription is a normal tRPC procedure: apply your own auth/middleware to it (e.g. build it from a `protectedProcedure`) to control who may connect.

## Limitations

- **Single process.** The hub is in-memory; there is no cross-instance fan-out. For multiple server instances, emit into the hub from a shared source yourself (or keep one process).
- **No durable delivery.** Events are fire-and-forget; nothing is buffered or replayed on reconnect.
- **Invalidation only.** This package tells clients which normal tRPC queries to refetch — it does not push data.

## API

### `@requestflo/trpc-live/client`
- `liveLink(options)` — drop-in for `httpSubscriptionLink` + auto-invalidation.
- `createLiveOperationLink(transport, config)` — the underlying tap (advanced).
- `invalidateTarget`, `applyInvalidationEvent`, `parseInvalidationEvent` — apply events to a `QueryClient` manually.

### `@requestflo/trpc-live/server`
- `createLiveHub()` — the in-process event hub.
- `createLiveProcedure(hub, t.procedure)` / `liveInvalidations(hub, signal)` — the subscription.
- `createLiveInvalidationProxy<AppRouter>({ hub })` — the `ctx.live` proxy.

## License

MIT
