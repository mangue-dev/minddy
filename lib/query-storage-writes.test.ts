import { beforeEach, expect, it, vi } from "vitest";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { createQueryStorage } from "./query-persistence";

const state = vi.hoisted(() => ({ generation: 0, save: vi.fn() }));
vi.mock("./local-snapshots", () => ({
  localSnapshotGeneration: () => state.generation,
  restoreLocalSnapshot: vi.fn(),
  saveLocalSnapshot: state.save,
}));
const snapshot = (buster: string, timestamp = 1): PersistedClient => ({
  timestamp, buster, clientState: { mutations: [], queries: [] },
});
function setup() {
  const writes: Array<{ client: PersistedClient; finish: () => void }> = [];
  const storage = { setItem: vi.fn(), removeItem: vi.fn() } as unknown as Storage;
  state.save.mockImplementation((target: Storage, key: string, _slot: string, client: PersistedClient) =>
    new Promise<void>(resolve => writes.push({ client, finish: () => {
      target.setItem(key, `encrypted-${client.buster}`);
      resolve();
    } })));
  return { writes, storage, persister: createQueryStorage(storage, "cache") };
}
beforeEach(() => { state.generation = 0; state.save.mockReset(); });

it("coalesces waiting writes and never stores an obsolete in-flight response", async () => {
  const { writes, storage, persister } = setup();
  const first = persister.persistClient(snapshot("first"));
  const superseded = persister.persistClient(snapshot("superseded"));
  const latest = persister.persistClient(snapshot("latest"));
  expect(writes).toHaveLength(1);
  writes[0].finish();
  await first;
  await superseded;
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(writes).toHaveLength(2);
  expect(writes[1].client.buster).toBe("latest");
  writes[1].finish();
  await latest;
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith("cache", "encrypted-latest");
});

it("shares identical pending saves and skips identical saved state despite outer timestamps", async () => {
  const { writes, persister } = setup();
  const first = persister.persistClient(snapshot("same", 1));
  const repeated = persister.persistClient(snapshot("same", 2));
  expect(writes).toHaveLength(1);
  writes[0].finish();
  await Promise.all([first, repeated]);
  await persister.persistClient(snapshot("same", 3));
  expect(writes).toHaveLength(1);
});

it("discards queued and in-flight writes when the account generation changes", async () => {
  const { writes, storage, persister } = setup();
  const first = persister.persistClient(snapshot("first"));
  const queued = persister.persistClient(snapshot("queued"));
  state.generation++;
  writes[0].finish();
  await Promise.all([first, queued]);
  expect(writes).toHaveLength(1);
  expect(storage.setItem).not.toHaveBeenCalled();
  const next = persister.persistClient(snapshot("queued"));
  expect(writes).toHaveLength(2);
  writes[1].finish();
  await next;
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith("cache", "encrypted-queued");
});

it("fences removal and retries after a failed seal without dropping newer queued state", async () => {
  const { writes, storage, persister } = setup();
  const first = persister.persistClient(snapshot("first"));
  const queued = persister.persistClient(snapshot("queued"));
  await persister.removeClient();
  writes[0].finish();
  await Promise.all([first, queued]);
  expect(writes).toHaveLength(1);
  expect(storage.setItem).not.toHaveBeenCalled();
  state.save.mockRejectedValueOnce(new Error("Seal unavailable"));
  await expect(persister.persistClient(snapshot("retry"))).rejects.toThrow("Seal unavailable");
  const retry = persister.persistClient(snapshot("retry"));
  writes[1].finish();
  await retry;
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith("cache", "encrypted-retry");
});
