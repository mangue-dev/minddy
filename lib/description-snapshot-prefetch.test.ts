// A description's snapshot can start loading on the mouse-down before the
// click that opens it (MIN-728); the session then takes it instead of asking
// again, once, and never an old one.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  prefetchDescriptionSnapshot,
  takeDescriptionSnapshot,
} from "@/lib/description-collaboration";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset().mockImplementation(async () =>
    new Response(JSON.stringify({ documentId: "issue-1", revision: fetchMock.mock.calls.length }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("hands a fresh prefetched snapshot to the session once", async () => {
  prefetchDescriptionSnapshot("issue", "issue-1");
  prefetchDescriptionSnapshot("issue", "issue-1");
  expect(fetchMock).toHaveBeenCalledOnce();

  const first = await takeDescriptionSnapshot("issue", "issue-1", new AbortController().signal);
  expect(first).toMatchObject({ revision: 1 });
  expect(fetchMock).toHaveBeenCalledOnce();

  await takeDescriptionSnapshot("issue", "issue-1", new AbortController().signal);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("reads again when the prefetched snapshot is too old", async () => {
  prefetchDescriptionSnapshot("objective", "objective-1");
  vi.advanceTimersByTime(11_000);
  await takeDescriptionSnapshot("objective", "objective-1", new AbortController().signal);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][0]).toBe("/api/documents/objective/objective-1/collaboration");
});
