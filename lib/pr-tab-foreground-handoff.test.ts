import { hashKey, onlineManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrTabPreparation } from "@/lib/pr-tab-preparation";
import { appTabPreparationQueries } from "@/lib/prefetch-tab-destination";
import { issuesQueryFn } from "@/lib/issues-api";

vi.mock("@/lib/app-tab-surfaces", () => ({ prepareAppTabSurface: vi.fn(), isAppTabSurfaceReady: () => true }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));
beforeEach(() => onlineManager.setOnline(true));
afterEach(() => { onlineManager.setOnline(true); vi.unstubAllGlobals(); });

function setup(href: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000 } } });
  const tasks = new Set<() => void>();
  const preparation = createPrTabPreparation(client, (task) => { tasks.add(task); return () => { tasks.delete(task); }; });
  const primary = href.includes("/pages/") ? ["page", "page"] : ["issues", "new"];
  const tabs = ["/home", href, "/projects/other"];
  for (const target of tabs) for (const option of appTabPreparationQueries(client, target)) {
    if ([hashKey(primary), hashKey(["issues", "other"])].includes(hashKey(option.queryKey))) continue;
    client.setQueryData(option.queryKey, []);
  }
  const reads: Array<{ path: string; signal: AbortSignal; finish: () => void }> = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const signal = init!.signal as AbortSignal;
    const row = { path: String(url), signal, finish: () => resolve(Response.json(String(url).endsWith("/pages/page")
      ? { id: "page", project_id: "new", version: 1, content: { type: "doc", content: [] } } : [])) };
    reads.push(row);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  })));
  const flush = () => {
    const ready = [...tasks];
    for (const task of ready) { tasks.delete(task); task(); }
  };
  return { client, preparation, primary, tabs, reads, flush };
}

describe("exact active destination handoff", () => {
  it.each(["/projects/new", "/projects/new/pages/page"])("preserves the selected %s read before its observer commits", async (href) => {
    const f = setup(href);
    let finishForeground!: () => void;
    try {
      f.preparation.visit("/home", f.tabs); f.flush();
      await vi.waitFor(() => expect(f.reads).toHaveLength(2));
      const accepted = f.reads.find((read) => read.path.includes("/projects/new/"))!;
      const other = f.reads.find((read) => read.path.includes("/projects/other/"))!;
      f.preparation.visit(href, f.tabs);
      expect(other.signal.aborted).toBe(true);
      expect(f.client.getQueryCache().find({ queryKey: f.primary, exact: true })?.getObserversCount()).toBe(0);
      const foreground = f.client.fetchQuery({ queryKey: ["categories", "new"], staleTime: 0,
        queryFn: () => new Promise((resolve) => { finishForeground = () => resolve([]); }) });
      void foreground.catch(() => undefined);
      expect(accepted.signal.aborted).toBe(false);
      f.flush();
      expect(f.reads.filter((read) => read.path === accepted.path)).toHaveLength(1);
      accepted.finish(); finishForeground(); await foreground;
      await vi.waitFor(() => expect(f.client.getQueryState(f.primary)?.status).toBe("success"));
      expect(f.reads.filter((read) => read.path === accepted.path)).toHaveLength(1);
    } finally { finishForeground?.(); f.preparation.dispose(); for (const read of f.reads) read.finish(); f.client.clear(); }
  });

  it.each(["next activation", "disposal"])("revokes the unobserved handoff on %s", async (action) => {
    const f = setup("/projects/new");
    try {
      f.preparation.visit("/home", f.tabs); f.flush(); await vi.waitFor(() => expect(f.reads).toHaveLength(2));
      f.preparation.visit("/projects/new", f.tabs);
      const selected = f.reads.find((read) => read.path.endsWith("/new/issues"))!;
      expect(selected.signal.aborted).toBe(false);
      if (action === "next activation") {
        f.preparation.visit("/home", f.tabs);
        void f.client.fetchQuery({ queryKey: ["other-foreground"], queryFn: async () => [] }).catch(() => undefined);
      }
      else f.preparation.dispose();
      expect(selected.signal.aborted).toBe(true);
    } finally { f.preparation.dispose(); for (const read of f.reads) read.finish(); f.client.clear(); }
  });

  it("does not block authoritative invalidation and cancellation of a cached active read", async () => {
    const f = setup("/projects/new");
    let stop: (() => void) | undefined;
    try {
      f.client.setQueryData(f.primary, []);
      await f.client.invalidateQueries({ queryKey: f.primary, exact: true, refetchType: "none" });
      f.preparation.visit("/home", f.tabs); f.flush(); await vi.waitFor(() => expect(f.reads).toHaveLength(2));
      const first = f.reads.find((read) => read.path.endsWith("/new/issues"))!;
      f.preparation.visit("/projects/new", f.tabs);
      const observer = new QueryObserver(f.client, { queryKey: f.primary, queryFn: issuesQueryFn("new") });
      stop = observer.subscribe(() => {});
      void f.client.invalidateQueries({ queryKey: f.primary, exact: true });
      expect(first.signal.aborted).toBe(true);
      await vi.waitFor(() => expect(f.reads.filter((read) => read.path === first.path)).toHaveLength(2));
      f.reads.findLast((read) => read.path === first.path)!.finish();
      await vi.waitFor(() => expect(f.client.getQueryState(f.primary)?.fetchStatus).toBe("idle"));
      expect(f.client.getQueryState(f.primary)?.isInvalidated).toBe(false);
    } finally { stop?.(); f.preparation.dispose(); for (const read of f.reads) read.finish(); f.client.clear(); }
  });

  it.each(["hidden", "offline"])("revokes an unobserved active handoff when the owner becomes %s", async (gate) => {
    const surface = new EventTarget() as EventTarget & { visibilityState: string; querySelectorAll: () => [] };
    surface.visibilityState = "visible"; surface.querySelectorAll = () => [];
    if (gate === "hidden") vi.stubGlobal("document", surface);
    const f = setup("/projects/new");
    let finishForeground: (() => void) | undefined;
    try {
      f.preparation.visit("/home", f.tabs); f.flush();
      await vi.waitFor(() => expect(f.reads).toHaveLength(2));
      const selected = f.reads.find((read) => read.path.endsWith("/new/issues"))!;
      f.preparation.visit("/projects/new", f.tabs);
      const foreground = f.client.fetchQuery({ queryKey: ["unknown-foreground"],
        queryFn: () => new Promise((resolve) => { finishForeground = () => resolve("ready"); }) });
      void foreground.catch(() => undefined);
      expect(selected.signal.aborted).toBe(false);
      expect(f.client.getQueryCache().find({ queryKey: f.primary, exact: true })?.getObserversCount()).toBe(0);
      if (gate === "hidden") {
        surface.visibilityState = "hidden"; surface.dispatchEvent(new Event("visibilitychange"));
      } else onlineManager.setOnline(false);
      expect(selected.signal.aborted).toBe(true);
      expect(f.client.getQueryState(["unknown-foreground"])?.fetchStatus).toBe("fetching");
      f.flush(); expect(f.reads).toHaveLength(2);
      finishForeground!(); await foreground;
    } finally {
      finishForeground?.(); f.preparation.dispose(); for (const read of f.reads) read.finish(); f.client.clear();
      onlineManager.setOnline(true);
    }
  });

});
