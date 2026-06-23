import { expectType, expectError } from "tsd";
import { createLiveInvalidationProxy } from "../../src/server";
import type { AppRouter } from "../fixtures/appRouter";

const live = createLiveInvalidationProxy<AppRouter>({
  publish: async () => {},
});

// query invalidation accepts correct input
expectType<Promise<void>>(
  live.response.list.invalidate({ requestId: "req_123" }),
);
expectType<Promise<void>>(
  live.dashboard.summary.invalidate({ organisationId: "org_123" }),
);
expectType<Promise<void>>(
  live.inbox.list.invalidate({ organisationId: "org_123" }),
);

// query invalidation rejects incorrect input
expectError(live.response.list.invalidate({ requestId: 123 }));
expectError(live.response.list.invalidate({ organisationId: "org_123" }));
expectError(live.dashboard.summary.invalidate({ requestId: "req_123" }));

// void-input procedures allow invalidate()
expectType<Promise<void>>(live.health.status.invalidate());
expectType<Promise<void>>(live.system.status.invalidate());

// void-input procedures reject unexpected input where possible
expectError(live.health.status.invalidate({ unexpected: true }));

// router invalidation accepts options only
expectType<Promise<void>>(live.response.invalidate());
expectType<Promise<void>>(live.response.invalidate({ channel: "org:org_123" }));

// root invalidation accepts options only
expectType<Promise<void>>(live.invalidate());
expectType<Promise<void>>(live.invalidate({ channel: "global" }));

// channel / actorId / skipActor options are accepted
expectType<Promise<void>>(
  live.response.list.invalidate(
    { requestId: "req_123" },
    { channel: "org:org_123", actorId: "user_123", skipActor: true },
  ),
);

// undefined input + options is allowed (procedure-wide with options)
expectType<Promise<void>>(
  live.response.list.invalidate(undefined, { channel: "org:org_123" }),
);

// unknown option is rejected
expectError(
  live.response.list.invalidate({ requestId: "req_123" }, { unknown: true }),
);
expectError(live.invalidate({ unknown: true }));
expectError(live.response.invalidate({ unknown: true }));
