import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./comments-api", () => ({
  fetchObjectiveCommentsApi: vi.fn(async (id: string) => { await fetch(`/api/objectives/${id}/comments`); return []; }),
  fetchObjectiveEventsApi: vi.fn(async (id: string) => { await fetch(`/api/objectives/${id}/events`); return []; }),
  fetchFeedbackCommentsApi: vi.fn(), fetchFeedbackEventsApi: vi.fn(),
}));
import { prefetchObjectiveDetail } from "./secondary-view-queries";

afterEach(() => vi.unstubAllGlobals());

it("starts an objective's four detail reads in parallel, once per objective", async () => {
  const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient();
  prefetchObjectiveDetail(client, "p", "o1");
  prefetchObjectiveDetail(client, "p", "o1");
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  const urls = fetchMock.mock.calls.map((call) => String((call as unknown[])[0]));
  expect(urls.every((url) => url.includes("/api/objectives/o1/"))).toBe(true);
  prefetchObjectiveDetail(client, "p", "o2");
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
});
