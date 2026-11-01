import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deliverServerSeed,
  deliverServerSeedPlan,
  discardServerSeeds,
  expectServerSeeds,
  isDocumentRequest,
  receiveServerSeeds,
  readStartTime,
  resetServerSeedsForTests,
  SERVER_SEED_GRACE_MS,
  SERVER_SEED_MAX_WAIT_MS,
  takeServerSeed,
} from "./server-seed";
import { fetchClientRead } from "./client-read";

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ auth }) }));
const session = (id = "owner") => ({ data: { session: { user: { id } } }, error: null });
const fetchMock = vi.fn<typeof fetch>();
const body = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
/** A page that started 400 ms before the shell announced its seeds. */
const expect400 = (options: Parameters<typeof expectServerSeeds>[0] = {}) =>
  expectServerSeeds({ now: 10_000, elapsedMs: 400, documentParsed: false, onDocumentParsed: () => () => {}, ...options });

beforeEach(() => {
  vi.useFakeTimers();
  auth.getSession.mockReset().mockResolvedValue(session());
  fetchMock.mockReset().mockImplementation(async () => Response.json({ from: "network" }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  resetServerSeedsForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reads sent with the page", () => {
  it("serves a read issued before the plan streams in, once, without the network", async () => {
    expect400();
    const first = fetchClientRead("/api/projects");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    deliverServerSeedPlan({ owner: "owner", paths: ["/api/projects", "/api/notifications"] });
    deliverServerSeed("/api/projects", body([{ id: "p1" }]));
    expect(await (await first).json()).toEqual([{ id: "p1" }]);
    expect(fetchMock).not.toHaveBeenCalled();
    // A refetch is a new read: it goes to the network.
    expect(await (await fetchClientRead("/api/projects")).json()).toEqual({ from: "network" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reads from the network for a path the plan does not list, or for another account", async () => {
    expect400();
    deliverServerSeedPlan({ owner: "someone-else", paths: ["/api/projects", "/api/notifications"] });
    deliverServerSeed("/api/projects", body([{ id: "theirs" }]));
    expect(await (await fetchClientRead("/api/billing")).json()).toEqual({ from: "network" });
    expect(await (await fetchClientRead("/api/projects")).json()).toEqual({ from: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the network when the server could not provide a response", async () => {
    expect400();
    deliverServerSeedPlan({ owner: "owner", paths: ["/api/projects", "/api/notifications"] });
    const read = fetchClientRead("/api/projects");
    deliverServerSeed("/api/projects", null);
    expect(await (await read).json()).toEqual({ from: "network" });
  });

  it("gives up on missing responses after the document is parsed and a grace period", async () => {
    let parsed!: () => void;
    expect400({ onDocumentParsed: (listener) => { parsed = listener; return () => {}; } });
    deliverServerSeedPlan({ owner: "owner", paths: ["/api/projects", "/api/notifications"] });
    const read = fetchClientRead("/api/projects");
    await vi.advanceTimersByTimeAsync(SERVER_SEED_GRACE_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();
    parsed();
    await vi.advanceTimersByTimeAsync(SERVER_SEED_GRACE_MS);
    expect(await (await read).json()).toEqual({ from: "network" });
    // Nothing is served after giving up, even a late delivery.
    deliverServerSeed("/api/notifications", body([]));
    expect(takeServerSeed("/api/notifications")).toBeNull();
  });

  it("never waits beyond the hard cap, even before the document is parsed", async () => {
    expect400();
    const read = fetchClientRead("/api/projects");
    await vi.advanceTimersByTimeAsync(SERVER_SEED_MAX_WAIT_MS);
    expect(await (await read).json()).toEqual({ from: "network" });
  });

  it("dates reads at the page start while seeds can be taken, so realtime catch-up re-reads them", async () => {
    expect(readStartTime(20_000)).toBe(20_000);
    expect400();
    expect(readStartTime(20_000)).toBe(9_600);
    deliverServerSeedPlan({ owner: "owner", paths: ["/api/projects"] });
    deliverServerSeed("/api/projects", body([]));
    await takeServerSeed("/api/projects");
    // Every planned response taken: back to the actual start time.
    expect(readStartTime(20_000)).toBe(20_000);
  });

  it("serves nothing after sign-out", async () => {
    expect400();
    deliverServerSeedPlan({ owner: "owner", paths: ["/api/projects", "/api/notifications"] });
    deliverServerSeed("/api/projects", body([{ id: "p1" }]));
    discardServerSeeds();
    expect(takeServerSeed("/api/projects")).toBeNull();
    expect(readStartTime(20_000)).toBe(20_000);
  });

  it("delivers each streamed response as its promise settles, independently", async () => {
    let projects!: (value: ReturnType<typeof body>) => void;
    receiveServerSeeds(Promise.resolve({
      owner: "owner", paths: ["/api/projects", "/api/notifications"],
      responses: {
        "/api/projects": new Promise((resolve) => { projects = resolve; }),
        "/api/notifications": Promise.resolve(body([{ id: "n1" }])),
      },
    }));
    expect(await (await fetchClientRead("/api/notifications")).json()).toEqual([{ id: "n1" }]);
    const pending = fetchClientRead("/api/projects");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    projects(body([{ id: "p1" }]));
    expect(await (await pending).json()).toEqual([{ id: "p1" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads from the network when the document's seeds fail", async () => {
    receiveServerSeeds(Promise.reject(new Error("stream broke")));
    expect(await (await fetchClientRead("/api/projects")).json()).toEqual({ from: "network" });
  });

  it("has nothing to serve when the document announced no seeds", () => {
    expect(takeServerSeed("/api/projects")).toBeNull();
  });

  it("recognizes only browser document navigations", () => {
    const headers = (entries: Record<string, string>) => new Headers(entries);
    expect(isDocumentRequest(headers({ "sec-fetch-dest": "document" }))).toBe(true);
    expect(isDocumentRequest(headers({ "sec-fetch-dest": "document", rsc: "1" }))).toBe(false);
    expect(isDocumentRequest(headers({ "sec-fetch-dest": "document", "next-router-prefetch": "1" }))).toBe(false);
    expect(isDocumentRequest(headers({ "sec-fetch-dest": "empty" }))).toBe(false);
    expect(isDocumentRequest(headers({}))).toBe(false);
  });
});
