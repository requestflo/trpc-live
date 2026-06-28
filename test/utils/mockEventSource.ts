/** A minimal EventSource stand-in so httpSubscriptionLink can be exercised without a network. */
export class MockEventSource {
  static instances: MockEventSource[] = [];
  static reset(): void {
    MockEventSource.instances = [];
  }

  readonly url: string;
  readyState = 0;
  closed = false;
  onmessage: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onopen: ((event: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
}
