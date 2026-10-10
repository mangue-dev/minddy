// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClientSave } from "@tanstack/react-query-persist-client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));
import { createQueryStorage } from "./query-persistence";
import { invalidateLocalSnapshotWrites, removeLocalSnapshot, restoreLocalSnapshot, saveLocalSnapshot } from "./local-snapshots";

afterEach(() => { window.localStorage.clear(); vi.unstubAllGlobals(); });

it("never writes decrypted content to the durable query snapshot", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ snapshot: {
    format: "minddy-local-v1", owner: "owner", expiresAt: Date.now() + 1000, ciphertext: "authenticated-envelope",
  } }), { status: 200 })));
  const client = new QueryClient();
  client.setQueryData(["issues", "synthetic-project"], [{ title: "PRIVATE_LOCAL_SENTINEL" }]);
  try {
    await persistQueryClientSave({ queryClient: client, persister: createQueryStorage(window.localStorage, "minddy.query-cache") });
    expect(window.localStorage.getItem("minddy.query-cache")).not.toContain("PRIVATE_LOCAL_SENTINEL");
  } finally { client.clear(); }
});

it("does not recreate local data after logout while a seal is in flight", async () => {
  let release!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
  const pending = saveLocalSnapshot(window.localStorage, "late", "issue-drafts", ["private"]);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  invalidateLocalSnapshotWrites();
  release(new Response(JSON.stringify({ snapshot: { format: "minddy-local-v1", ciphertext: "sealed" } })));
  await expect(pending).rejects.toThrow("account changed");
  expect(window.localStorage.getItem("late")).toBeNull();
});

it("expires a local envelope without contacting the server", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  window.localStorage.setItem("expired", JSON.stringify({ format: "minddy-local-v1", expiresAt: Date.now() - 1, ciphertext: "sealed" }));
  expect(await restoreLocalSnapshot(window.localStorage, "expired", "query-cache")).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
  expect(window.localStorage.getItem("expired")).toBeNull();
});
it("does not restore a snapshot removed while its open request is in flight", async () => {
  let release!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
  window.localStorage.setItem("cleared", JSON.stringify({ format: "minddy-local-v1", expiresAt: Date.now() + 1000, ciphertext: "sealed" }));
  const pending = restoreLocalSnapshot(window.localStorage, "cleared", "issue-drafts");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  removeLocalSnapshot(window.localStorage, "cleared");
  release(new Response(JSON.stringify({ value: ["old private draft"] })));
  expect(await pending).toBeUndefined();
  expect(window.localStorage.getItem("cleared")).toBeNull();
});

it("shares identical in-flight opens but reauthorizes every later read", async () => {
  let release!: (value: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
  vi.stubGlobal("fetch", fetch);
  const envelope = JSON.stringify({ format: "minddy-local-v1", expiresAt: Date.now() + 10000, ciphertext: "sealed" });
  window.localStorage.setItem("shared", envelope);
  const first = restoreLocalSnapshot(window.localStorage, "shared", "window-tabs");
  const second = restoreLocalSnapshot(window.localStorage, "shared", "window-tabs");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  release(new Response(JSON.stringify({ value: { id: "tab" } })));
  expect(await first).toEqual({ id: "tab" });
  expect(await second).toEqual({ id: "tab" });
  const later = restoreLocalSnapshot(window.localStorage, "shared", "window-tabs");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  release(new Response(JSON.stringify({ value: { id: "later" } })));
  expect(await later).toEqual({ id: "later" });
});

it("never shares open results across changed ciphertext, storage or account generation", async () => {
  const releases: ((value: Response) => void)[] = [];
  const fetch = vi.fn(() => new Promise<Response>((resolve) => { releases.push(resolve); }));
  vi.stubGlobal("fetch", fetch);
  const envelope = (ciphertext: string) => JSON.stringify({ format: "minddy-local-v1", expiresAt: Date.now() + 10000, ciphertext });
  window.localStorage.setItem("isolated", envelope("one"));
  const old = restoreLocalSnapshot(window.localStorage, "isolated", "window-tabs");
  window.localStorage.setItem("isolated", envelope("two"));
  const changed = restoreLocalSnapshot(window.localStorage, "isolated", "window-tabs");
  window.sessionStorage.setItem("isolated", envelope("two"));
  const otherStorage = restoreLocalSnapshot(window.sessionStorage, "isolated", "window-tabs");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  invalidateLocalSnapshotWrites();
  const otherAccount = restoreLocalSnapshot(window.localStorage, "isolated", "window-tabs");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
  releases.forEach((release) => release(new Response(JSON.stringify({ value: "private" }))));
  expect(await old).toBeUndefined();
  expect(await changed).toBeUndefined();
  expect(await otherStorage).toBeUndefined();
  expect(await otherAccount).toBe("private");
  window.sessionStorage.clear();
});
