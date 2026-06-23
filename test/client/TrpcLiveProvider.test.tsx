import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { TrpcLiveProvider } from "../../src/client/TrpcLiveProvider";
import { useTrpcLiveStatus } from "../../src/client/useTrpcLiveStatus";
import { createTestQueryClient } from "../fixtures/queryClient";
import { trpc } from "../fixtures/trpcClient";
import {
  createMockEventSourceFactory,
  type MockEventSource,
} from "../utils/mockEventSource";
import type { TrpcLiveInvalidationEvent } from "../../src/shared/types";

afterEach(cleanup);

function StatusProbe() {
  const status = useTrpcLiveStatus();
  return <div data-testid="state">{status.state}</div>;
}

function first(instances: MockEventSource[]): MockEventSource {
  const source = instances[0];
  if (!source) throw new Error("No EventSource was created");
  return source;
}

const event: TrpcLiveInvalidationEvent = {
  id: "evt_1",
  type: "trpc.invalidate",
  targets: [{ scope: "all" }],
  createdAt: "2026-06-23T22:00:00.000Z",
};

function renderProvider(
  props: Partial<React.ComponentProps<typeof TrpcLiveProvider>> = {},
) {
  const { factory, instances } = createMockEventSourceFactory();
  const queryClient = props.queryClient ?? createTestQueryClient();
  const utils = render(
    <TrpcLiveProvider
      trpc={trpc}
      queryClient={queryClient}
      url="/api/live/sse"
      eventSourceFactory={factory}
      {...props}
    >
      <StatusProbe />
    </TrpcLiveProvider>,
  );
  return { ...utils, instances, queryClient };
}

describe("TrpcLiveProvider", () => {
  it("opens exactly one EventSource connection", () => {
    const { instances } = renderProvider();
    expect(instances).toHaveLength(1);
    expect(first(instances).url).toBe("/api/live/sse");
  });

  it("does not open multiple connections across re-renders", () => {
    const { instances, rerender, queryClient } = renderProvider();
    rerender(
      <TrpcLiveProvider
        trpc={trpc}
        queryClient={queryClient}
        url="/api/live/sse"
        eventSourceFactory={createMockEventSourceFactory().factory}
      >
        <StatusProbe />
      </TrpcLiveProvider>,
    );
    expect(instances).toHaveLength(1);
  });

  it("closes the EventSource on unmount", () => {
    const { instances, unmount } = renderProvider();
    expect(first(instances).closed).toBe(false);
    unmount();
    expect(first(instances).closed).toBe(true);
  });

  it("updates the live status as the connection opens", () => {
    const { instances, getByTestId } = renderProvider();
    expect(getByTestId("state").textContent).toBe("connecting");
    act(() => first(instances).emitOpen());
    expect(getByTestId("state").textContent).toBe("connected");
  });

  it("handles a trpc.invalidate event and invalidates the cache", () => {
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { instances } = renderProvider({ queryClient });

    act(() => first(instances).emitOpen());
    spy.mockClear();
    act(() =>
      first(instances).emitMessage("trpc.invalidate", JSON.stringify(event)),
    );

    expect(spy).toHaveBeenCalled();
  });

  it("ignores malformed events without invalidating or throwing", () => {
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { instances } = renderProvider({ queryClient });

    act(() => first(instances).emitOpen());
    spy.mockClear();

    act(() => {
      first(instances).emitMessage("trpc.invalidate", "{ not json");
      first(instances).emitMessage(
        "trpc.invalidate",
        JSON.stringify({ type: "something.else" }),
      );
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it("accepts all optional props and still opens one connection", () => {
    const { instances } = renderProvider({
      reconnect: { enabled: true, minDelayMs: 100, onReconnect: "invalidate-all" },
      withCredentials: true,
      debug: true,
    });
    expect(instances).toHaveLength(1);
    expect(first(instances).withCredentials).toBe(true);
  });

  it("notifies onEvent for valid events", () => {
    const onEvent = vi.fn();
    const { instances } = renderProvider({ onEvent });
    act(() => first(instances).emitOpen());
    act(() =>
      first(instances).emitMessage("trpc.invalidate", JSON.stringify(event)),
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({ id: "evt_1" });
  });
});
