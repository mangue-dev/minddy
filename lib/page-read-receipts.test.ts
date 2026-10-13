import { CancelledError, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observePageReadFailures, pageReadState } from "./page-read-receipts";

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe("account Page read failure observation", () => {
  it("installs once and leaves unrelated errors and canceled Page reads unchanged", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const subscribe = vi.spyOn(client.getQueryCache(), "subscribe");
    observePageReadFailures(client);
    observePageReadFailures(client);
    expect(subscribe).toHaveBeenCalledTimes(1);
    const failed = new Error("Unavailable");
    for (const queryKey of [["projects"], ["pages", "project"], ["page-comments", "page"]]) {
      await expect(client.fetchQuery({ queryKey, queryFn: async () => { throw failed; } })).rejects.toBe(failed);
      const query = client.getQueryCache().find({ queryKey, exact: true });
      expect(query?.state.error).toBe(failed);
      expect(pageReadState(query)).toBeUndefined();
    }
    const canceled = new CancelledError({ revert: false });
    const queryKey = ["page", "canceled"];
    await expect(client.fetchQuery({ queryKey, queryFn: async () => { throw canceled; } })).rejects.toBe(canceled);
    expect(pageReadState(client.getQueryCache().find({ queryKey, exact: true }))).toBeUndefined();
  });
});
