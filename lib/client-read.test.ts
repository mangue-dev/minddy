import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_READ_TIMEOUT_MS, fetchClientRead } from "./client-read";
import { fetchIssuesApi } from "./issues-api";
import { fetchGlobalBoardApi } from "./global-board-api";
import { fetchProjectsApi } from "./projects-api";
import { downloadPageExportApi, fetchPagesApi } from "./pages-api";
import { fetchAppTabs, createAppTab } from "./app-tabs-api";
import { fetchPullRequestApi, ApiError } from "./agent-api";
import { fetchBillingUsageApi } from "./billing-api";

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ auth }) }));
vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));
const session = (id = "owner") => ({ data: { session: { user: { id } } }, error: null });
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.useFakeTimers();
  auth.getSession.mockReset().mockResolvedValue(session());
  fetchMock.mockReset().mockImplementation(async () => Response.json({ ready: true }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("protected client reads", () => {
  it("lets archive generation and body transfer exceed the normal read deadline", async () => {
    let headers!: (response: Response) => void;
    let body!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { body = controller; } });
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { headers = resolve; }));
    const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild: vi.fn() } });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:archive");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const pending = downloadPageExportApi("project", "page", { branch: true });
    await vi.advanceTimersByTimeAsync(CLIENT_READ_TIMEOUT_MS + 1);
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project/pages/page/export?scope=branch", expect.anything());
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    headers(new Response(stream, { headers: { "Content-Disposition": "attachment; filename*=UTF-8''complete.zip" } }));
    await vi.advanceTimersByTimeAsync(CLIENT_READ_TIMEOUT_MS + 1);
    expect(anchor.click).not.toHaveBeenCalled();
    body.enqueue(new TextEncoder().encode("complete archive"));
    body.close();
    await pending;
    expect(anchor.download).toBe("complete.zip");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(auth.getSession).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds archive session preparation and rejects an account switch after transfer", async () => {
    auth.getSession.mockImplementationOnce(() => new Promise(() => {}));
    const pending = fetchClientRead("/api/projects/project/pages/page/export", undefined, { timeoutMs: null });
    const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(CLIENT_READ_TIMEOUT_MS);
    await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
    auth.getSession.mockResolvedValueOnce(session()).mockResolvedValueOnce(session("other"));
    await expect(fetchClientRead("/api/projects/project/pages/page/export", undefined, { timeoutMs: null })).rejects.toThrow("account changed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels archive transport even after the normal read deadline", async () => {
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    const caller = new AbortController();
    const pending = fetchClientRead("/api/projects/project/pages/page/export", { signal: caller.signal }, { timeoutMs: null });
    await vi.advanceTimersByTimeAsync(CLIENT_READ_TIMEOUT_MS + 1);
    caller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["project board", () => fetchIssuesApi("project")],
    ["global board", () => fetchGlobalBoardApi()],
    ["projects", () => fetchProjectsApi()],
    ["page", () => fetchPagesApi("project")],
    ["tabs", () => fetchAppTabs()],
    ["pull request", () => fetchPullRequestApi("pr")],
    ["usage", () => fetchBillingUsageApi()],
  ] as const)("waits for renewed cookies before fetching %s", async (_name, read) => {
    let renew!: (value: ReturnType<typeof session>) => void;
    auth.getSession.mockImplementationOnce(() => new Promise(resolve => { renew = resolve; }));
    const pending = read();
    expect(fetchMock).not.toHaveBeenCalled();
    renew(session());
    await expect(pending).resolves.toEqual({ ready: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out a stalled session and never starts its read after late renewal", async () => {
    let renew!: (value: ReturnType<typeof session>) => void;
    auth.getSession.mockImplementationOnce(() => new Promise(resolve => { renew = resolve; }));
    const pending = fetchClientRead("/api/projects");
    const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(CLIENT_READ_TIMEOUT_MS);
    await rejected;
    renew(session());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds headers and body stalls, aborts transport, and permits a later read", async () => {
    for (const phase of ["headers", "body"]) {
      let transport!: AbortSignal;
      fetchMock.mockImplementationOnce(async (_url, init) => {
        transport = init!.signal!;
        if (phase === "headers") return new Promise<Response>(() => {});
        return new Response(new ReadableStream({ start() {} }));
      });
      const pending = fetchClientRead("/api/projects");
      const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(CLIENT_READ_TIMEOUT_MS);
      await rejected;
      expect(transport.aborted).toBe(true);
    }
    await expect((await fetchClientRead("/api/projects")).json()).resolves.toEqual({ ready: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves cancellation while waiting for session renewal", async () => {
    let renew!: (value: ReturnType<typeof session>) => void;
    auth.getSession.mockImplementationOnce(() => new Promise(resolve => { renew = resolve; }));
    const controller = new AbortController();
    const pending = fetchClientRead("/api/projects", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    renew(session());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not serve data after the account changes during a read", async () => {
    auth.getSession.mockResolvedValueOnce(session()).mockResolvedValueOnce(session("other"));
    await expect(fetchClientRead("/api/projects")).rejects.toThrow("account changed");
  });

  it("does not send reads for absent sessions or failed renewals", async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(fetchClientRead("/api/projects")).rejects.toMatchObject({ status: 401 });
    const unavailable = new Error("Auth unavailable");
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: unavailable });
    await expect(fetchClientRead("/api/projects")).rejects.toBe(unavailable);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves PR status, code and Retry-After without replaying authorization failures", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Paused", code: "rateLimited" }, {
      status: 429, headers: { "Retry-After": "60" },
    }));
    const error = await fetchPullRequestApi("pr").catch(error => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: "rateLimited", retryAt: Date.now() + 60_000 });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Unauthorized" }, { status: 401 }));
    await expect(fetchPullRequestApi("pr")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects writes and external paths, while tab creation retains its existing request", async () => {
    expect(() => fetchClientRead("/api/projects", { method: "POST" })).toThrow("GET method");
    expect(() => fetchClientRead("https://other.example/api/projects")).toThrow("relative API path");
    fetchMock.mockResolvedValueOnce(Response.json({ tab: { id: "tab" } }));
    await expect(createAppTab(true, "tab")).resolves.toEqual({ id: "tab" });
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });
});
