import type { QueryClient } from "@tanstack/react-query";

export const PAYLOAD_GC_TIME_MS = 60_000;

/** Large optional payloads reload on demand instead of accumulating all day. */
export const MEMORY_ONLY_PAYLOAD_PREFIXES = [
  ["pull-request"], ["pr-commit-diff"], ["desktop-agent-run-diff"],
  ["agent-run-diff"], ["agent-run-events"], ["page"],
] as const;

export function configurePayloadRetention(client: QueryClient) {
  for (const prefix of MEMORY_ONLY_PAYLOAD_PREFIXES) {
    client.setQueryDefaults(prefix, { gcTime: PAYLOAD_GC_TIME_MS });
  }
}

export function isMemoryOnlyPayload(key: readonly unknown[]) {
  return MEMORY_ONLY_PAYLOAD_PREFIXES.some(prefix => prefix.every((part, index) => key[index] === part));
}
