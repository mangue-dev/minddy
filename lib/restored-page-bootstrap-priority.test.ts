import { afterEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { observeRestoredPageBootstrapPriority, restoredPageBootstrapPriority } from "./restored-page-bootstrap-priority";

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.clear()));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  const clock = { at: 1000 };
  observeRestoredPageBootstrapPriority(client, { startedAt: 1000, now: () => clock.at });
  return { client, clock };
}

describe("initial streamed bootstrap priority tombstones", () => {
  it("retains no authority without an observer installed before queries", () => {
    const client = new QueryClient(); clients.push(client);
    expect(restoredPageBootstrapPriority(client, ["page", "p"])).toBe("closed");
    client.setQueryData(["page", "p"], {}, { updatedAt: 1 });
    observeRestoredPageBootstrapPriority(client, { startedAt: 1000, now: () => 1001 });
    expect(restoredPageBootstrapPriority(client, ["page", "p"])).toBe("closed");
  });

  it("ignores pure old hydration while preserving current success and setState priority", () => {
    const { client } = setup();
    client.setQueryData(["issues", "old"], [], { updatedAt: 999 });
    expect(restoredPageBootstrapPriority(client, ["issues", "old"])).toBe("admissible");
    client.setQueryData(["members", "current"], {}, { updatedAt: 1000 });
    expect(restoredPageBootstrapPriority(client, ["members", "current"])).toBe("priority");
    const query = client.getQueryCache().find({ queryKey: ["issues", "old"], exact: true })!;
    query.setState({ dataUpdatedAt: 1001 });
    expect(restoredPageBootstrapPriority(client, ["issues", "old"])).toBe("priority");
  });

  it.each(["denial", "invalidation", "accepted-write", "trash"])("retains the %s tombstone after the Query is removed", async (kind) => {
    const { client } = setup(), key = ["page", "removed"];
    if (kind === "denial") await client.fetchQuery({ queryKey: key, queryFn: async () => { throw new Error("Denied"); } }).catch(() => {});
    else {
      client.setQueryData(key, { version: 5 }, { updatedAt: 999 });
      if (kind === "invalidation") await client.invalidateQueries({ queryKey: key, refetchType: "none" });
      if (kind === "accepted-write") client.setQueryData(key, { version: 6 }, { updatedAt: 1001 });
    }
    client.removeQueries({ queryKey: key, exact: true });
    expect(client.getQueryCache().find({ queryKey: key, exact: true })).toBeUndefined();
    expect(restoredPageBootstrapPriority(client, key)).toBe("priority");
  });

  it("gives actual fetch priority immediately and never crosses client ownership", async () => {
    const { client } = setup(), other = setup().client, key = ["objectives", "project"];
    let finish!: (data: unknown[]) => void;
    const reading = client.fetchQuery({ queryKey: key, queryFn: () => new Promise<unknown[]>((resolve) => { finish = resolve; }) });
    expect(restoredPageBootstrapPriority(client, key)).toBe("priority");
    expect(restoredPageBootstrapPriority(other, key)).toBe("admissible");
    finish([]); await reading;
  });

  it("fails closed after 128 distinct keys and never reopens on repeated installation", () => {
    const { client } = setup();
    for (let index = 0; index < 129; index++) client.setQueryData(["issues", String(index)], [], { updatedAt: 1001 });
    expect(restoredPageBootstrapPriority(client, ["page", "unseen"])).toBe("closed");
    observeRestoredPageBootstrapPriority(client, { startedAt: 2000, now: () => 2001 });
    expect(restoredPageBootstrapPriority(client, ["page", "unseen"])).toBe("closed");
  });

  it("expires on the next event without timers and refuses every later chunk", () => {
    const { client, clock } = setup();
    clock.at = 16001;
    client.setQueryData(["unrelated"], {});
    expect(restoredPageBootstrapPriority(client, ["page", "p"])).toBe("closed");
    clock.at = 1001;
    expect(restoredPageBootstrapPriority(client, ["page", "p"])).toBe("closed");
  });
});
