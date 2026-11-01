import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { holdReadsInFlight } from "./hold-reads-in-flight";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("holdReadsInFlight", () => {
  afterEach(() => vi.useRealTimers());

  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const answer = deferred<string>();
    const signals: AbortSignal[] = [];
    const read = vi.fn(({ signal }: { signal: AbortSignal }) => { signals.push(signal); return answer.promise; });
    const observe = () => new QueryObserver(client, { queryKey: ["me", "board"], queryFn: read });
    return { client, answer, signals, read, observe };
  }

  it("lets the next tree join a read the previous tree started", async () => {
    const { client, answer, signals, read, observe } = setup();
    const leaving = observe().subscribe(() => {});
    holdReadsInFlight(client);
    leaving();
    const arriving = observe();
    const stop = arriving.subscribe(() => {});
    expect(signals[0].aborted).toBe(false);
    expect(read).toHaveBeenCalledOnce();
    answer.resolve("rows");
    await vi.waitFor(() => expect(arriving.getCurrentResult().data).toBe("rows"));
    // The hold ends with the read: only the new tree observes the query.
    expect(client.getQueryCache().find({ queryKey: ["me", "board"] })?.getObserversCount()).toBe(1);
    stop();
    client.clear();
  });

  it("without a hold, the same handoff cancels and restarts the read", () => {
    const { client, signals, read, observe } = setup();
    const leaving = observe().subscribe(() => {});
    leaving();
    const stop = observe().subscribe(() => {});
    expect(signals[0].aborted).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
    stop();
    client.clear();
  });

  it("releases a read nobody joins once its limit passes", async () => {
    vi.useFakeTimers();
    const { client, signals, observe } = setup();
    const leaving = observe().subscribe(() => {});
    holdReadsInFlight(client);
    leaving();
    expect(signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(signals[0].aborted).toBe(true);
    client.clear();
  });
});
