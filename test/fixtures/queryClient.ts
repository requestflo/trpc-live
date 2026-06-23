import { QueryClient } from "@tanstack/react-query";

/** A QueryClient configured for deterministic tests (no retries/refetch). */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
