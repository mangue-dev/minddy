import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createProjectBootstrapPair, PROJECT_BOOTSTRAP_FRAME_BYTES } from "./project-bootstrap-api";
import { CLIENT_READ_TIMEOUT_MS } from "./client-read";

const mocks = vi.hoisted(() => ({ session: vi.fn(), overlay: vi.fn() }));
vi.mock("./client-read", () => ({ CLIENT_READ_TIMEOUT_MS: 30_000, prepareClientSession: mocks.session }));
vi.mock("./optimistic/issue-writes", () => ({ applyPendingObjectives: mocks.overlay }));
const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
const pairs: ReturnType<typeof createProjectBootstrapPair>[] = [];
const encoder = new TextEncoder();
const flush = () => vi.advanceTimersByTimeAsync(0);
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } }), {
    headers: { "content-type": "application/x-ndjson" },
  });
  fetchMock.mockResolvedValue(response);
  const pair = createProjectBootstrapPair(client, "project");
  pairs.push(pair);
  const members = client.fetchQuery({ queryKey: ["members", "project"], queryFn: pair.members });
  const objectives = client.fetchQuery({ queryKey: ["objectives", "project"], queryFn: pair.objectives });
  void members.catch(() => {}); void objectives.catch(() => {});
  const frame = (reader: string, data: unknown = []) => stream.enqueue(encoder.encode(JSON.stringify({ version: 1, reader, ok: true, data }) + "\n"));
  return { client, pair, members, objectives, stream, frame };
}
beforeEach(() => {
  vi.useFakeTimers();
  mocks.session.mockReset().mockResolvedValue("account");
  mocks.overlay.mockReset().mockImplementation((rows) => rows);
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  for (const pair of pairs.splice(0)) pair.dispose();
  for (const client of clients.splice(0)) client.clear();
  await flush();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("independently framed project reads", () => {
  it("registers both real query owners before dispatch and releases a small result before the other frame", async () => {
    const run = setup(); await flush();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(run.client.getQueryState(["members", "project"])?.fetchStatus).toBe("fetching");
    expect(run.client.getQueryState(["objectives", "project"])?.fetchStatus).toBe("fetching");
    run.frame("members", { members: [], invitations: [], owner: null });
    await expect(run.members).resolves.toEqual({ members: [], invitations: [], owner: null });
    expect(run.client.getQueryState(["objectives", "project"])?.data).toBeUndefined();
    run.frame("objectives"); run.stream.close();
    await expect(run.objectives).resolves.toEqual([]); await flush();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("uses the original read start for optimistic objectives even when its frame arrives later", async () => {
    const start = Date.now(); const run = setup(); await flush();
    await vi.advanceTimersByTimeAsync(1000);
    run.frame("objectives", [{ id: "complete", description: "full" }]);
    await run.objectives;
    expect(mocks.overlay).toHaveBeenCalledWith([{ id: "complete", description: "full" }], start, "project");
    run.frame("members", {}); run.stream.close(); await run.members;
  });
  it("joins an existing foreground observer to the same query without another request", async () => {
    const run = setup(); await flush();
    const foreground = run.client.fetchQuery({ queryKey: ["members", "project"], queryFn: () => { throw new Error("Wrong reader"); } });
    run.frame("members", {}); run.frame("objectives"); run.stream.close();
    await expect(foreground).resolves.toEqual({}); await run.objectives;
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("discards one canceled frame while retaining the other foreground owner", async () => {
    const run = setup(); await flush();
    await run.client.cancelQueries({ queryKey: ["members", "project"], exact: true });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    run.frame("members", { forbiddenLateValue: true }); run.frame("objectives"); run.stream.close();
    await run.objectives;
    expect(run.client.getQueryData(["members", "project"])).toBeUndefined();
  });
  it("aborts transport when the final owner is canceled", async () => {
    const run = setup(); await flush();
    await run.client.cancelQueries(); await flush();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["invalidate", "remove"])("fences a %s generation before a late frame without denying the other reader", async (action) => {
    const run = setup(); await flush();
    if (action === "invalidate") await run.client.invalidateQueries({ queryKey: ["members", "project"], refetchType: "none" });
    else run.client.removeQueries({ queryKey: ["members", "project"] });
    run.frame("members", { oldGeneration: true }); run.frame("objectives"); run.stream.close();
    await expect(run.members).rejects.toBeDefined(); await run.objectives;
    expect(run.client.getQueryData(["members", "project"])).toBeUndefined();
  });
  it("rejects an account change between independent frames", async () => {
    const run = setup(); await flush();
    run.frame("members", {}); await run.members;
    mocks.session.mockResolvedValue("replacement"); run.frame("objectives"); run.stream.close();
    await expect(run.objectives).rejects.toThrow("account changed");
    expect(run.client.getQueryData(["objectives", "project"])).toBeUndefined();
  });
  it("disposes the old account operation without publishing its frames", async () => {
    const run = setup(); await flush(); run.pair.dispose();
    await expect(run.members).rejects.toMatchObject({ name: "AbortError" });
    await expect(run.objectives).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("keeps an ordinary per-reader denial independent from the other complete DTO", async () => {
    const run = setup(); await flush();
    run.stream.enqueue(encoder.encode(JSON.stringify({ version: 1, reader: "members", ok: false, status: 404, error: "Project not found" }) + "\n"));
    run.frame("objectives"); run.stream.close();
    await expect(run.members).rejects.toMatchObject({ status: 404, message: "Project not found" });
    await expect(run.objectives).resolves.toEqual([]);
  });
  it.each(["truncated", "unknown", "duplicate", "oversized", "wrong-version"])("rejects %s stream data without installing missing objectives", async (kind) => {
    const run = setup(); await flush();
    if (kind === "truncated") { run.frame("members", {}); await run.members; }
    if (kind === "unknown") run.frame("other");
    if (kind === "duplicate") { run.frame("members", {}); await run.members; run.frame("members", {}); }
    if (kind === "oversized") run.stream.enqueue(encoder.encode("x".repeat(PROJECT_BOOTSTRAP_FRAME_BYTES + 1)));
    if (kind === "wrong-version") run.stream.enqueue(encoder.encode('{"version":2,"reader":"objectives","ok":true,"data":[]}\n'));
    run.stream.close(); await expect(run.objectives).rejects.toBeDefined();
    expect(run.client.getQueryData(["objectives", "project"])).toBeUndefined();
  });
  it("bounds stalled headers and body consumption with the same deadline", async () => {
    const run = setup(); await flush();
    const failure = expect(run.objectives).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(CLIENT_READ_TIMEOUT_MS); await failure;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("never dispatches a one-owner operation before a second query is admitted", async () => {
    const client = new QueryClient(); clients.push(client);
    const pair = createProjectBootstrapPair(client, "project"); pairs.push(pair);
    const result = pair.members(); void result.catch(() => {}); await flush();
    expect(fetchMock).not.toHaveBeenCalled(); pair.dispose();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
  it("retires an unjoined cohort on cancellation and never adds listeners for a late join", async () => {
    const client = new QueryClient(); clients.push(client);
    const pair = createProjectBootstrapPair(client, "project"); pairs.push(pair);
    const canceled = new AbortController(); canceled.abort();
    await expect(pair.members({ signal: canceled.signal })).rejects.toMatchObject({ name: "AbortError" });
    const late = new AbortController(); const listen = vi.spyOn(late.signal, "addEventListener");
    await expect(pair.objectives({ signal: late.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(listen).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds abandoned admission even when its caller forgets to finish the cohort", async () => {
    const client = new QueryClient(); clients.push(client);
    const pair = createProjectBootstrapPair(client, "project"); pairs.push(pair);
    const pending = pair.members(); void pending.catch(() => {});
    await vi.advanceTimersByTimeAsync(CLIENT_READ_TIMEOUT_MS);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("preserves bounded ordinary HTTP denial messages and codes", async () => {
    const run = setup();
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Session is no longer active", code: "session_inactive" }, { status: 401 }));
    await expect(run.members).rejects.toMatchObject({ status: 401, message: "Session is no longer active", code: "session_inactive" });
    await expect(run.objectives).rejects.toMatchObject({ status: 401 });
  });
  it("fences a changed account while an HTTP denial body is consumed", async () => {
    const run = setup();
    // setup has already captured the original owner before its first await.
    mocks.session.mockResolvedValue("replacement");
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Old account failure" }, { status: 403 }));
    await expect(run.members).rejects.toThrow("account changed");
    await expect(run.objectives).rejects.toThrow("account changed");
  });
});
