import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { configurePayloadRetention, MEMORY_ONLY_PAYLOAD_PREFIXES, PAYLOAD_GC_TIME_MS } from "./query-retention";
import { isPersistableKey } from "./query-provider";
import { pullRequestQueryOptions } from "./pull-request-query";

it("evicts inactive payloads without evicting active reads or persisted boards", async () => {
  vi.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 86_400_000 } } });
  configurePayloadRetention(client);
  const key = pullRequestQueryOptions("active").queryKey;
  client.setQueryData(key, { pr: { title: "Active PR" }, files: [{ patch: "large" }] });
  const observer = new QueryObserver(client, { queryKey: key, enabled: false });
  const stop = observer.subscribe(() => {});
  try {
    for (const prefix of MEMORY_ONLY_PAYLOAD_PREFIXES) client.setQueryData([...prefix, "inactive"], { payload: "large" });
    client.setQueryData(["issues", "project"], [{ id: "issue" }]);
    await vi.advanceTimersByTimeAsync(PAYLOAD_GC_TIME_MS + 1);
    for (const prefix of MEMORY_ONLY_PAYLOAD_PREFIXES) {
      expect(client.getQueryData([...prefix, "inactive"])).toBeUndefined();
      expect(isPersistableKey([...prefix, "inactive"])).toBe(false);
    }
    expect(client.getQueryData(key)).toBeDefined();
    expect(client.getQueryData(["issues", "project"])).toBeDefined();
    expect(isPersistableKey(["issues", "project"])).toBe(true);
    stop();
    await vi.advanceTimersByTimeAsync(PAYLOAD_GC_TIME_MS + 1);
    expect(client.getQueryData(key)).toBeUndefined();
  } finally { stop(); client.clear(); vi.useRealTimers(); }
});
