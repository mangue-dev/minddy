// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClientSave } from "@tanstack/react-query-persist-client";
import { afterEach, expect, it, vi } from "vitest";
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
  removeLocalSnapshot(window.localStorage, "cleared");
  release(new Response(JSON.stringify({ value: ["old private draft"] })));
  expect(await pending).toBeUndefined();
  expect(window.localStorage.getItem("cleared")).toBeNull();
});
