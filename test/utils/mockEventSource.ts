import type { EventSourceFactory, EventSourceLike } from "../../src/client/types";

type MessageListener = (event: MessageEvent) => void;

/** A controllable EventSource stand-in for provider / reconnect tests. */
export class MockEventSource implements EventSourceLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  readonly url: string;
  readonly withCredentials: boolean;
  private readonly listeners = new Map<string, Set<MessageListener>>();

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
  }

  addEventListener(type: string, listener: MessageListener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: MessageListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.readyState = 2;
  }

  // --- test controls ---

  emitOpen(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  emitError(): void {
    this.onerror?.(new Event("error"));
  }

  emitMessage(type: string, data: string): void {
    const event = new MessageEvent(type, { data });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

export function createMockEventSourceFactory(): {
  factory: EventSourceFactory;
  instances: MockEventSource[];
} {
  const instances: MockEventSource[] = [];
  const factory: EventSourceFactory = (url, init) => {
    const source = new MockEventSource(url, init);
    instances.push(source);
    return source;
  };
  return { factory, instances };
}
