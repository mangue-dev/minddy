import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prefetchAppTabDestination } from "./prefetch-tab-destination";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";

const response = (data: unknown = {}) => ({ ok: true, text: async () => JSON.stringify(data) });

let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

const requested = () => fetchMock.mock.calls.map(([url]) => String(url).split("?")[0]);

describe("tab destination prefetch", () => {
  it("warms the routines list and the agent catalog once per destination", async () => {
    prefetchAppTabDestination(client, "/routines", new Set());
    await vi.waitFor(() => expect(requested()).toEqual(["/api/routines", "/api/agent/models"]));
    prefetchAppTabDestination(client, "/routines", new Set());
    await vi.waitFor(() => expect(requested()).toEqual(["/api/routines", "/api/agent/models"]));
  });

  it("maps project destinations to the five board reads", async () => {
    prefetchAppTabDestination(client, "/projects/p1?view=7", new Set());
    await vi.waitFor(() => expect(requested()).toEqual([
      "/api/projects/p1/issues",
      "/api/projects/p1/categories",
      "/api/projects/p1/members",
      "/api/projects/p1/objectives",
      "/api/projects/p1/issue-relations",
    ]));
  });

  it("skips the aggregate board read when the cache already carries data", async () => {
    client.setQueryData(GLOBAL_BOARD_KEY, { issues: [] });
    prefetchAppTabDestination(client, "/all", new Set());
    await vi.waitFor(() => expect(requested()).toEqual(["/api/me/views"]));
  });

  it("leaves unknown destinations alone", () => {
    prefetchAppTabDestination(client, "/settings", new Set());
    expect(requested()).toEqual([]);
  });
});
