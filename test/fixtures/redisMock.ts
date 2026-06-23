type MessageListener = (channel: string, message: string) => void;

/**
 * A tiny in-memory stand-in for an ioredis publisher/subscriber pair. The
 * publisher delivers messages straight to the subscriber's listeners, and the
 * mock records calls so adapter tests can assert on them.
 */
export function createRedisMock() {
  const listeners = new Set<MessageListener>();

  const publisher = {
    published: [] as Array<{ channel: string; message: string }>,
    publish(channel: string, message: string) {
      publisher.published.push({ channel, message });
      for (const listener of [...listeners]) listener(channel, message);
      return Promise.resolve(1);
    },
  };

  const subscriber = {
    subscribedChannels: new Set<string>(),
    unsubscribeCalls: [] as string[],
    onCalls: 0,
    on(event: "message", listener: MessageListener) {
      if (event === "message") {
        subscriber.onCalls += 1;
        listeners.add(listener);
      }
      return subscriber;
    },
    off(event: "message", listener: MessageListener) {
      if (event === "message") listeners.delete(listener);
      return subscriber;
    },
    subscribe(channel: string) {
      subscriber.subscribedChannels.add(channel);
      return Promise.resolve(1);
    },
    unsubscribe(channel: string) {
      subscriber.unsubscribeCalls.push(channel);
      subscriber.subscribedChannels.delete(channel);
      return Promise.resolve(1);
    },
    /** Emit a raw message directly (e.g. to test malformed JSON). */
    emit(channel: string, message: string) {
      for (const listener of [...listeners]) listener(channel, message);
    },
  };

  return { publisher, subscriber };
}
