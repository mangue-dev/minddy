// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, StrictMode, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { invalidateLocalSnapshotWrites, restoreLocalSnapshot, saveLocalSnapshot } from "./local-snapshots";
import { createWindowSelectionPersistence } from "./window-selection-persistence";

const session = vi.hoisted(() => ({ owner: "owner" as string | null }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: session.owner ? { user: { id: session.owner } } : null }, error: null }),
} }) }));

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

type Request = { signal: AbortSignal; payload: { operation: string; slot: string; value: { id: string; href: string } };
  reply: (ciphertext?: string, owner?: string, status?: number) => void; respond: (value: unknown) => void };
const owners = new Set<ReturnType<typeof createWindowSelectionPersistence>>();
const roots = new Set<Root>();
function setup() {
  const storage = new MemoryStorage(), requests: Request[] = [];
  // Deliberately ignore AbortSignal in transport. The actual request deadline
  // and writer must still fence a late obsolete server response.
  const transport = vi.fn<typeof globalThis.fetch>(async (_url, init) => new Promise<Response>((resolve) => {
    requests.push({ signal: init!.signal as AbortSignal, payload: JSON.parse(init!.body as string),
      reply: (ciphertext = "sealed", owner = "owner", status = 200) => resolve(Response.json({ snapshot: {
        format: "minddy-local-v1", owner, expiresAt: Date.now() + 60_000, ciphertext,
      } }, { status })), respond: (value) => resolve(Response.json(value)) });
  }));
  vi.stubGlobal("fetch", transport);
  const writer = createWindowSelectionPersistence(storage, "window-owner", "owner");
  owners.add(writer);
  return { storage, requests, transport, writer };
}
const tick = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
beforeEach(() => { session.owner = "owner"; vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots.clear();
  for (const writer of owners) writer.dispose();
  owners.clear(); invalidateLocalSnapshotWrites(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("window selection persistence", () => {
  it("serializes normal seals, keeps only the latest queued selection and fences ACKs at enqueue time", async () => {
    const { storage, requests, writer } = setup();
    writer.remember("first", "/projects/PRIVATE_FIRST");
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    writer.remember("second", "/projects/PRIVATE_SECOND");
    writer.remember("third", "/projects/PRIVATE_THIRD");
    writer.remember("third", "/projects/PRIVATE_THIRD");
    await tick(); expect(requests).toHaveLength(1);
    requests[0].reply("obsolete-first");
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(storage.getItem("window-owner")).toBeNull();
    expect(requests[1].payload).toEqual({ operation: "seal", slot: "window-tabs", value: { id: "third", href: "/projects/PRIVATE_THIRD" }, claimLegacy: false });
    const flushed = writer.flush(); requests[1].reply("latest-third"); await flushed;
    expect(storage.getItem("window-owner")).toContain("latest-third");
    expect(storage.getItem("window-owner")).not.toContain("PRIVATE_");
    expect(requests).toHaveLength(2);
  });

  it("coalesces synchronous duplicate notifications and replaces a removed saved envelope", async () => {
    const { storage, requests, writer } = setup();
    writer.remember("same", "/home"); writer.remember("same", "/home");
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const first = writer.flush(); requests[0].reply("saved-once"); await first;
    writer.remember("same", "/home"); await tick(); expect(requests).toHaveLength(1);
    storage.removeItem("window-owner"); writer.remember("same", "/home");
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    const second = writer.flush(); requests[1].reply("replacement"); await second;
    expect(storage.getItem("window-owner")).toContain("replacement");
  });

  it("flushes the latest selection promptly while obsolete transport ignores abort and preserves a newer flight's finalizer", async () => {
    const { storage, requests, writer } = setup();
    writer.remember("first", "/home");
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    writer.remember("second", "/routines");
    const flushed = writer.flush();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests[1].signal.aborted).toBe(false);
    writer.remember("third", "/all");
    requests[0].reply("late-first"); await tick();
    expect(requests).toHaveLength(2); expect(storage.getItem("window-owner")).toBeNull();
    requests[1].reply("obsolete-second"); await flushed;
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    expect(storage.getItem("window-owner")).toBeNull();
    const latest = writer.flush(); requests[2].reply("final-third"); await latest;
    expect(storage.getItem("window-owner")).toContain("final-third");
    expect(requests).toHaveLength(3);
  });

  it("makes one attempt per pending intent after failures and retries only on an explicit flush", async () => {
    const { storage, requests, writer } = setup();
    writer.remember("first", "/home");
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    writer.remember("second", "/all"); requests[0].reply("failure", "owner", 500);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    const failed = writer.flush(); requests[1].reply("failure", "owner", 500); await failed;
    writer.remember("second", "/all"); await tick();
    expect(requests).toHaveLength(2); expect(storage.getItem("window-owner")).toBeNull();
    const retry = writer.flush();
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    requests[2].reply("explicit-retry"); await retry;
    expect(storage.getItem("window-owner")).toContain("explicit-retry");
  });

  it.each(["dispose", "generation"] as const)("does not dispatch queued work or recreate cleared storage after %s retirement", async (retirement) => {
    const { storage, requests, writer } = setup();
    writer.remember("old", "/home");
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    writer.remember("queued", "/all");
    if (retirement === "dispose") writer.dispose(); else invalidateLocalSnapshotWrites();
    storage.clear(); requests[0].reply("late"); await tick();
    writer.remember("later", "/routines"); await writer.flush();
    expect(requests).toHaveLength(1); expect(storage.length).toBe(0);
  });

  it("rejects the wrong SDK owner before dispatch, after a delayed seal and from the returned envelope", async () => {
    const { storage, requests, writer } = setup();
    session.owner = "other"; writer.remember("wrong-before", "/home"); await writer.flush();
    expect(requests).toHaveLength(0);
    session.owner = "owner"; writer.remember("changed-after", "/all");
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    session.owner = "other"; requests[0].reply("old-owner"); await tick();
    expect(storage.length).toBe(0);
    session.owner = "owner"; writer.remember("wrong-envelope", "/routines");
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    const flushed = writer.flush(); requests[1].reply("foreign-envelope", "other"); await flushed;
    expect(storage.length).toBe(0);
  });

  it("permanently retires an old instance while a replacement owner can save using the same storage key", async () => {
    const { storage, requests, writer } = setup();
    writer.remember("old", "/home");
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    writer.dispose();
    const replacement = createWindowSelectionPersistence(storage, "window-owner", "owner"); owners.add(replacement);
    replacement.remember("new", "/all");
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    writer.remember("retired", "/routines"); await writer.flush();
    const saved = replacement.flush(); requests[1].reply("new-instance"); await saved;
    requests[0].reply("old-late"); await tick();
    expect(storage.getItem("window-owner")).toContain("new-instance"); expect(requests).toHaveLength(2);
  });

  it("keeps the exact mounted owner through StrictMode replay and permanently retires it on real unmount", async () => {
    const { storage, requests } = setup();
    let mountedWriter!: ReturnType<typeof createWindowSelectionPersistence>;
    function Owner() {
      const writer = useRef<ReturnType<typeof createWindowSelectionPersistence> | null>(null);
      if (!writer.current) { writer.current = createWindowSelectionPersistence(storage, "strict-window", "owner"); owners.add(writer.current); }
      mountedWriter = writer.current;
      const mounted = useRef(false);
      useEffect(() => {
        mounted.current = true;
        writer.current!.remember("same", "/home");
        return () => {
          mounted.current = false;
          queueMicrotask(() => { if (!mounted.current) writer.current!.dispose(); });
        };
      }, []);
      return null;
    }
    const container = document.createElement("div"), root = createRoot(container); roots.add(root);
    await act(async () => root.render(createElement(StrictMode, null, createElement(Owner))));
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].signal.aborted).toBe(false);
    const first = mountedWriter.flush(); requests[0].reply("strict-saved"); await first;
    mountedWriter.remember("later", "/all");
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => root.unmount()); roots.delete(root);
    expect(requests[1].signal.aborted).toBe(true);
    requests[1].reply("unmounted-late"); await tick();
    mountedWriter.remember("retired", "/routines"); await mountedWriter.flush();
    expect(requests).toHaveLength(2);
    expect(storage.getItem("strict-window")).toContain("strict-saved");
  });

  it("renews an expired saved envelope rather than deduplicating it forever", async () => {
    vi.useFakeTimers();
    const { storage, requests, writer } = setup();
    writer.remember("same", "/home"); await tick(); expect(requests).toHaveLength(1);
    const first = writer.flush(); requests[0].reply("first"); await first;
    await vi.advanceTimersByTimeAsync(60_001);
    writer.remember("same", "/home"); await tick(); expect(requests).toHaveLength(2);
    const renewed = writer.flush(); requests[1].reply("renewed"); await renewed;
    expect(storage.getItem("window-owner")).toContain("renewed");
  });

  it("retains the ordinary eight-second deadline without starting an automatic retry", async () => {
    vi.useFakeTimers();
    const { storage, requests, writer } = setup();
    writer.remember("pending", "/home"); await tick();
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(7_999);
    expect(requests[0].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests[0].signal.aborted).toBe(true);
    expect(storage.length).toBe(0);
    writer.remember("pending", "/home"); await tick();
    expect(requests).toHaveLength(1);
  });

  it("keeps the generic seal and read-only restore contracts and forwards cancellation through the existing deadline", async () => {
    const { storage, requests } = setup();
    const generic = saveLocalSnapshot(storage, "generic", "issue-drafts", ["private"]);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].reply("generic-seal", "different-owner"); await generic;
    expect(storage.getItem("generic")).toContain("generic-seal");
    const read = restoreLocalSnapshot(storage, "generic", "issue-drafts");
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1].respond({ value: ["restored-private"] }); await expect(read).resolves.toEqual(["restored-private"]);
    const abort = new AbortController();
    const canceled = saveLocalSnapshot(storage, "abort", "window-tabs", { id: "tab", href: "/home" }, false,
      { signal: abort.signal, expectedOwner: "owner" });
    const rejected = expect(canceled).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    abort.abort(); await rejected; requests[2].reply("ignored-abort"); await tick();
    expect(storage.getItem("abort")).toBeNull();
  });
});
