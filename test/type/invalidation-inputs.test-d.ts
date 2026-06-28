import { expectType, expectError } from "tsd";
import { createLiveInvalidationProxy } from "../../src/server";
import type { AppRouter } from "../fixtures/appRouter";

const live = createLiveInvalidationProxy<AppRouter>({
  publish: () => {},
});

// query invalidation accepts correct input
expectType<Promise<void>>(
  live.response.list.invalidate({ requestId: "req_123" }),
);
expectType<Promise<void>>(
  live.dashboard.summary.invalidate({ organisationId: "org_123" }),
);

// query invalidation rejects incorrect input
expectError(live.response.list.invalidate({ requestId: 123 }));
expectError(live.response.list.invalidate({ organisationId: "org_123" }));

// void-input procedures allow invalidate()
expectType<Promise<void>>(live.health.status.invalidate());
expectType<Promise<void>>(live.system.status.invalidate());

// void-input procedures reject unexpected input where possible
expectError(live.health.status.invalidate({ unexpected: true }));

// router and root invalidation take no arguments
expectType<Promise<void>>(live.response.invalidate());
expectType<Promise<void>>(live.invalidate());
expectError(live.response.invalidate({ channel: "org:org_123" }));
expectError(live.invalidate({ channel: "global" }));

// invalidate no longer accepts an options argument
expectError(
  live.response.list.invalidate({ requestId: "req_123" }, { channel: "x" }),
);

// batch is typed and returns the callback result
expectType<Promise<number>>(live.batch(async () => 1));
