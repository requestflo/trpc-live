import { createInvalidationEvent } from "./event";
import type {
  CreateTrpcLiveServerOptions,
  TrpcLiveServer,
} from "./types";
import type {
  PublishInvalidationInput,
  TrpcLiveInvalidationEvent,
} from "../shared/types";

const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  // Disable proxy buffering (nginx) so events flush immediately.
  "x-accel-buffering": "no",
};

const DEFAULT_KEEP_ALIVE_MS = 15_000;

/** Format an event as an SSE frame: `event: <type>\n` + `data: <json>\n\n`. */
function formatSse(event: TrpcLiveInvalidationEvent): string {
  const data = JSON.stringify(event);
  const dataLines = data
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n");
  return `event: ${event.type}\n${dataLines}\n\n`;
}

type Client<TUser> = {
  user: TUser;
  send: (event: TrpcLiveInvalidationEvent) => void;
  close: () => void;
};

/**
 * Create a live server: a `publish()` that pushes events onto your transport,
 * and a `handleSse()` that streams matching events to one connected client.
 *
 * A single subscription to the pub/sub adapter is shared across every
 * connection; received events are fanned out to clients that pass `canReceive`.
 */
export function createTrpcLiveServer<TUser = unknown>(
  options: CreateTrpcLiveServerOptions<TUser>,
): TrpcLiveServer {
  const clients = new Set<Client<TUser>>();
  const keepAliveMs =
    options.keepAliveMs === undefined ? DEFAULT_KEEP_ALIVE_MS : options.keepAliveMs;

  let unsubscribe: (() => Promise<void>) | null = null;
  let subscribing: Promise<void> | null = null;

  function reportError(error: unknown): void {
    options.onError?.(error);
  }

  async function deliver(
    client: Client<TUser>,
    event: TrpcLiveInvalidationEvent,
  ): Promise<void> {
    try {
      if (options.canReceive) {
        const allowed = await options.canReceive({ user: client.user, event });
        if (!allowed) return;
      }

      // Suppress echoing an event back to the actor that caused it.
      if (event.skipActor && event.actorId !== undefined && options.getActorId) {
        const actorId = await options.getActorId(client.user);
        if (actorId !== undefined && actorId === event.actorId) return;
      }

      client.send(event);
    } catch (error) {
      reportError(error);
    }
  }

  async function ensureSubscribed(): Promise<void> {
    if (unsubscribe) return;
    if (subscribing) return subscribing;

    subscribing = (async () => {
      unsubscribe = await options.pubsub.subscribe((event) => {
        for (const client of clients) {
          void deliver(client, event);
        }
      });
    })();

    try {
      await subscribing;
    } finally {
      subscribing = null;
    }
  }

  async function publish(
    input: PublishInvalidationInput,
  ): Promise<TrpcLiveInvalidationEvent> {
    const event = createInvalidationEvent(input);
    await options.pubsub.publish(event);
    return event;
  }

  function unauthorized(): Response {
    return new Response("Unauthorized", { status: 401 });
  }

  async function handleSse(request: Request): Promise<Response> {
    let user: TUser;
    if (options.getUser) {
      try {
        const resolved = await options.getUser(request);
        if (resolved === null || resolved === undefined) return unauthorized();
        user = resolved;
      } catch (error) {
        reportError(error);
        return unauthorized();
      }
    } else {
      user = undefined as TUser;
    }

    await ensureSubscribed();

    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    function send(event: TrpcLiveInvalidationEvent): void {
      if (closed || !controller) return;
      try {
        controller.enqueue(encoder.encode(formatSse(event)));
      } catch (error) {
        reportError(error);
        close();
      }
    }

    function close(): void {
      if (closed) return;
      closed = true;
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      clients.delete(client);
      try {
        controller?.close();
      } catch {
        // controller may already be closed
      }
    }

    const client: Client<TUser> = { user, send, close };

    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        controller = ctrl;
        clients.add(client);
        // Open the stream with a comment so the connection is established.
        ctrl.enqueue(encoder.encode(": connected\n\n"));

        if (keepAliveMs) {
          keepAliveTimer = setInterval(() => {
            if (closed || !controller) return;
            try {
              controller.enqueue(encoder.encode(": ping\n\n"));
            } catch {
              close();
            }
          }, keepAliveMs);
          // Don't keep the process alive solely for the heartbeat (Node only).
          (keepAliveTimer as { unref?: () => void }).unref?.();
        }
      },
      cancel() {
        close();
      },
    });

    request.signal?.addEventListener?.("abort", close);

    return new Response(stream, { headers: SSE_HEADERS });
  }

  async function close(): Promise<void> {
    for (const client of [...clients]) client.close();
    clients.clear();
    if (unsubscribe) {
      const fn = unsubscribe;
      unsubscribe = null;
      await fn();
    }
  }

  return {
    publish,
    handleSse,
    get connectionCount() {
      return clients.size;
    },
    close,
  };
}
