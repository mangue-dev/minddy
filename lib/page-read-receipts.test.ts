import { CancelledError, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptPageRead, acceptPageWrite, beginPageRead, hasNewerAcceptedPageMetadata, isAcceptedPageVersion, isNewerPageMetadata, observePageReadFailures, pageReadState } from "./page-read-receipts";

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


describe("accepted Page server metadata order", () => {
  it("orders same-version actual timestamps across offsets and PostgreSQL fractions", () => {
    const at = (updatedAt: string, version = 7) => ({ updatedAt, version });
    expect(isNewerPageMetadata(at("2026-10-14T00:00:00.200002Z"), at("2026-10-14T00:00:00.200001Z"))).toBe(true);
    expect(isNewerPageMetadata(at("2026-10-14T02:00:00.200001+02:00"), at("2026-10-14T00:00:00.200002Z"))).toBe(false);
    expect(isNewerPageMetadata(at("2026-10-14T00:00:00.200001Z"), at("2026-10-14T00:00:00.200001Z"))).toBe(false);
    expect(isNewerPageMetadata(at("2026-10-13T00:00:00Z", 8), at("2026-10-14T00:00:00Z", 7))).toBe(true);
    expect(isNewerPageMetadata(at("invalid"), at("2026-10-14T00:00:00Z"))).toBe(false);
  });

  it("uses scoped actual receipt metadata without promoting manual cache timestamps or clearing denial", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const other = new QueryClient(); clients.push(client, other); observePageReadFailures(client);
    const key = ["page", "written"], page = { pageId: "written", projectId: "project", version: 8,
      updatedAt: "2026-10-14T00:00:00.200002Z" };
    client.setQueryData(key, { version: 8, title: "Local preview", updated_at: "2099-01-01T00:00:00Z" });
    other.setQueryData(key, { version: 8 });
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    const older = { ...page, updatedAt: "2026-10-14T00:00:00.200001Z" };
    expect(hasNewerAcceptedPageMetadata(query, older)).toBe(false);
    acceptPageWrite(query, page);
    expect(hasNewerAcceptedPageMetadata(query, older)).toBe(true);
    expect(hasNewerAcceptedPageMetadata(query, { ...page, updatedAt: "2026-10-14T00:00:00.200003Z" })).toBe(false);
    expect(hasNewerAcceptedPageMetadata(query, { ...older, projectId: "foreign" })).toBe(false);
    expect(hasNewerAcceptedPageMetadata(other.getQueryCache().find({ queryKey: key, exact: true }), older)).toBe(false);
    const denied = new Error("Denied");
    await expect(client.fetchQuery({ queryKey: key, queryFn: async () => { throw denied; }, staleTime: 0 })).rejects.toBe(denied);
    expect(hasNewerAcceptedPageMetadata(query, older)).toBe(true);
    expect(pageReadState(query)?.failure).toBe(denied);
    client.removeQueries({ queryKey: key, exact: true }); client.setQueryData(key, { version: 8 });
    expect(hasNewerAcceptedPageMetadata(client.getQueryCache().find({ queryKey: key, exact: true }), older)).toBe(false);
  });

  it("ignores retired or aborted reads and keeps actual metadata across a later older accepted read", () => {
    const client = new QueryClient(); clients.push(client); client.setQueryData(["page", "read"], {});
    const query = client.getQueryCache().find({ queryKey: ["page", "read"], exact: true });
    const page = { pageId: "read", projectId: "project", version: 7, updatedAt: "2026-10-14T00:00:00.200002Z" };
    const abort = new AbortController();
    const old = beginPageRead(query), current = beginPageRead(query, abort.signal);
    acceptPageRead(query, old, page);
    expect(hasNewerAcceptedPageMetadata(query, { ...page, updatedAt: "2026-10-14T00:00:00.200001Z" })).toBe(false);
    abort.abort(); acceptPageRead(query, current, page, abort.signal);
    expect(pageReadState(query)?.newestMetadata).toBeUndefined();
    const accepted = beginPageRead(query); acceptPageRead(query, accepted, page);
    const next = beginPageRead(query); acceptPageRead(query, next, { ...page, updatedAt: "2026-10-14T00:00:00.200000Z" });
    expect(hasNewerAcceptedPageMetadata(query, { ...page, updatedAt: "2026-10-14T00:00:00.200001Z" })).toBe(true);
  });
});
