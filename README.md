# @requestflo/trpc-live

**Server-driven live invalidation for tRPC over one shared SSE connection.**

Call an invalidation on the backend:

```ts
await ctx.live.response.list.invalidate({ requestId });
```

…and every connected browser that has that query cached refetches it — using
your normal tRPC / TanStack Query setup:

```ts
const responses = trpc.response.list.useQuery({ requestId });
```

No `useLiveQuery`. No frontend topics. No per-component subscriptions. Just one
SSE connection per browser tab and the queries you already wrote.

---

## How it works

1. A backend mutation calls `ctx.live.<router>.<procedure>.invalidate(input?)`.
2. That produces a small **invalidation event** (procedure path + query input —
   never record data) which is published over your transport (Redis in
   production, in-memory for dev/tests).
3. Each server process streams matching events to connected clients over a
   single **Server-Sent Events** connection.
4. `TrpcLiveProvider` resolves each event to a TanStack Query key and calls
   `queryClient.invalidateQueries(...)` — exactly what `utils.*.invalidate()`
   would do, but driven from the server.

## Install

```bash
npm install @requestflo/trpc-live
# or
pnpm add @requestflo/trpc-live
# or
bun add @requestflo/trpc-live
```

Peer dependencies: `@trpc/client`, `@trpc/react-query`, `@trpc/server`,
`@tanstack/react-query`, and `react` (18 or 19). `hono` and `ioredis` are
optional and only needed for their respective adapters.

## Quick start

### 1. Frontend setup

Wrap your app once. Frontend code keeps using normal tRPC queries.

```tsx
import { TrpcLiveProvider } from "@requestflo/trpc-live/client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TrpcLiveProvider trpc={trpc} queryClient={queryClient} url="/api/live/sse">
      {children}
    </TrpcLiveProvider>
  );
}
```

```ts
// Nothing special here — just tRPC.
const responses = trpc.response.list.useQuery({ requestId });
const dashboard = trpc.dashboard.summary.useQuery({ organisationId });
```

### 2. Backend setup

```ts
import { createTrpcLiveServer } from "@requestflo/trpc-live/server";
import { createRedisPubSub } from "@requestflo/trpc-live/server/redis";
import { createLiveInvalidationProxy } from "@requestflo/trpc-live/server";
import type { AppRouter } from "./router";

const pubsub = createRedisPubSub({
  publisher: redisPublisher,
  subscriber: redisSubscriber,
  channel: "trpc-live:invalidations",
});

export const liveServer = createTrpcLiveServer({
  pubsub,
  getUser: (request) => getUserFromRequest(request),
  canReceive: ({ user, event }) => {
    if (!event.channel) return true;
    return user.allowedChannels.includes(event.channel);
  },
});

export const live = createLiveInvalidationProxy<AppRouter>({
  publish: (event) => liveServer.publish(event),
});

export async function createContext() {
  return { prisma, live };
}
```

### 3. Invalidate from a mutation

```ts
await ctx.live.response.list.invalidate({ requestId });
```

## Invalidation API

The backend proxy mirrors tRPC's client-side `utils.*.invalidate()` helpers and
is fully typed from your `AppRouter`.

| Call | Scope | Effect |
| --- | --- | --- |
| `ctx.live.response.list.invalidate({ requestId })` | query | One exact cached query |
| `ctx.live.response.list.invalidate()` | procedure | Every cached variant of `response.list` |
| `ctx.live.response.invalidate()` | router | Everything under `response.*` |
| `ctx.live.invalidate()` | all | The entire tRPC cache |

TypeScript autocompletes valid paths and inputs, and **rejects** invalid ones:

```ts
ctx.live.fake.router.invalidate();          // ❌ type error
ctx.live.response.list.invalidate({ x: 1 }); // ❌ type error (wrong input)
ctx.live.health.status.invalidate();         // ✅ void-input procedure
```

## Batch invalidate

Group several invalidations into a single event:

```ts
await ctx.live.batch(async () => {
  await ctx.live.response.list.invalidate({ requestId });
  await ctx.live.dashboard.summary.invalidate({ organisationId });
  await ctx.live.inbox.list.invalidate({ organisationId });
});
```

The batch:

- collects every target inside the callback,
- publishes **one** event after the callback succeeds,
- returns the callback's result,
- publishes nothing if no invalidations occur, and
- discards everything if the callback throws.

## Channels

`channel` is optional. With no channel, an event is broadcast to all connected
clients (clients without that query cached simply do nothing). Provide a channel
to scope delivery to a subset of clients:

```ts
await ctx.live.response.list.invalidate(
  { requestId },
  { channel: `org:${organisationId}` },
);
```

A channel is an arbitrary string — the package does not know what an
organisation, team, or user is:

```ts
{ channel: "org:org_123" }
{ channel: "team:team_123" }
{ channel: "user:user_123" }
```

The whole batch can take a channel, and an individual invalidate can override
it:

```ts
await ctx.live.batch({ channel: `org:${organisationId}` }, async () => {
  await ctx.live.response.list.invalidate({ requestId });
  // Overrides the batch channel — delivered as its own event.
  await ctx.live.system.status.invalidate(undefined, { channel: "global" });
});
```

When you use channels, implement `canReceive` on the server to enforce who may
receive what. With no channel the default is a global broadcast.

`actorId` and `skipActor` are optional advanced options: `actorId` records who
caused an invalidation, and `skipActor` (combined with a `getActorId` resolver
on the server) suppresses echoing the event back to its originator.

## Hono adapter

```ts
import { Hono } from "hono";
import { honoTrpcLiveAdapter } from "@requestflo/trpc-live/server/hono";

const app = new Hono();
app.route("/api/live", honoTrpcLiveAdapter(liveServer));
// exposes GET /api/live/sse
```

The endpoint authenticates with `getUser`, keeps the connection open, streams
events in SSE format, filters with `canReceive`, and drops disconnected clients.

`liveServer.handleSse(request)` returns a standard `Response`, so it also works
with any framework that speaks the web `Request`/`Response` API.

## Pub/Sub adapters

### Redis (production)

```ts
import { createRedisPubSub } from "@requestflo/trpc-live/server/redis";

const pubsub = createRedisPubSub({
  publisher,   // an ioredis client
  subscriber,  // a second ioredis client in subscriber mode
  channel: "trpc-live:invalidations",
  onError: (error) => log.error(error),
});
```

Use **separate** publisher and subscriber connections — a connection in
subscriber mode cannot issue normal commands.

### Memory (dev / tests)

```ts
import { createMemoryPubSub } from "@requestflo/trpc-live/server/memory";

const pubsub = createMemoryPubSub();
```

Both implement the same `LivePubSubAdapter` interface, so you can swap them per
environment. Implement your own for SQS, NATS, Postgres `LISTEN/NOTIFY`, etc.

## Reconnect behaviour

SSE connections drop. When one is re-established the provider can invalidate
queries, because events may have been missed while disconnected.

```tsx
<TrpcLiveProvider
  trpc={trpc}
  queryClient={queryClient}
  url="/api/live/sse"
  reconnect={{
    enabled: true,
    minDelayMs: 500,
    maxDelayMs: 5000,
    onReconnect: "invalidate-active", // "nothing" | "invalidate-active" | "invalidate-all"
  }}
>
  <App />
</TrpcLiveProvider>
```

Reconnection uses exponential backoff between `minDelayMs` and `maxDelayMs`.
Defaults: `enabled: true`, `minDelayMs: 500`, `maxDelayMs: 5000`,
`onReconnect: "invalidate-active"`.

## Connection status

```ts
import { useTrpcLiveStatus } from "@requestflo/trpc-live/client";

const status = useTrpcLiveStatus();
// status.state: "idle" | "connecting" | "connected" | "reconnecting" | "closed" | "error"
// status.reconnectCount, status.lastEventAt, status.error
```

## Security notes

Invalidation events are broadcast metadata, not data transport. **Never put
sensitive values in query inputs that may be broadcast.**

Events may contain only:

- the procedure path,
- query input identifiers,
- a channel, an `actorId`, an event id, and a timestamp.

They must **not** contain access tokens, secrets, full user records, document
content, uploaded files, or full response payloads. The application is
responsible for keeping query inputs free of sensitive values, and for
implementing `canReceive` whenever channels are used.

## Limitations

- **No durable delivery in v1.** Events missed while disconnected are not
  replayed; use `onReconnect` to recover. There is no event log or backfill.
- **One event format:** invalidation only. This package does not push data — it
  tells clients which normal tRPC queries to refetch.
- **Runtime scope is path-based.** The proxy infers query / procedure / router
  scope from the call path; the documented two-level `router.procedure` shape is
  fully supported.
- It is not a database, not a Convex replacement, and does not replace tRPC or
  TanStack Query.

## License

MIT
