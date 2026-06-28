import { expectType, expectError } from "tsd";
import { createLiveInvalidationProxy } from "../../src/server";
import type { AppRouter } from "../fixtures/appRouter";

const live = createLiveInvalidationProxy<AppRouter>({
  publish: () => {},
});

expectType<Promise<void>>(
  live.response.list.invalidate({
    requestId: "req_123",
  }),
);

expectType<Promise<void>>(live.response.list.invalidate());

expectType<Promise<void>>(live.response.invalidate());

expectType<Promise<void>>(live.invalidate());

expectError(
  live.response.list.invalidate({
    wrong: true,
  }),
);

expectError(live.fake.list.invalidate());

expectError(live.response.fake.invalidate());
