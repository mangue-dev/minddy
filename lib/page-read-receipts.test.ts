import { CancelledError, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptPageWrite, isAcceptedPageVersion, observePageReadFailures, pageReadState } from "./page-read-receipts";

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe("account Page read failure observation", () => {
  it("scopes accepted PATCH versions to their Query without clearing a later read failure", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const other = new QueryClient(); clients.push(client, other);
    observePageReadFailures(client);
    const key = ["page", "written"];
    client.setQueryData(key, { version: 6 });
    other.setQueryData(key, { version: 6 });
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    const page = { pageId: "written", projectId: "project", version: 6 };
    acceptPageWrite(query, page);
    expect(isAcceptedPageVersion(query, page)).toBe(true);
    expect(isAcceptedPageVersion(query, { ...page, version: 999 })).toBe(false);
    expect(isAcceptedPageVersion(query, { ...page, projectId: "other" })).toBe(false);
    expect(isAcceptedPageVersion(other.getQueryCache().find({ queryKey: key, exact: true }), page)).toBe(false);
    const denied = new Error("Read access denied");
    await expect(client.fetchQuery({ queryKey: key, queryFn: async () => { throw denied; }, staleTime: 0 })).rejects.toBe(denied);
    acceptPageWrite(query, { ...page, version: 7 });
    expect(pageReadState(query)?.failure).toBe(denied);
    client.removeQueries({ queryKey: key, exact: true });
    client.setQueryData(key, { version: 7 });
    expect(isAcceptedPageVersion(client.getQueryCache().find({ queryKey: key, exact: true }), { ...page, version: 7 })).toBe(false);
  });

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
