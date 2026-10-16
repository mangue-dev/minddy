import { beforeEach, expect, it, vi } from "vitest";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { QueryClient, dehydrate, hashKey, hydrate } from "@tanstack/react-query";
import { boundedQuerySnapshot, createQueryStorage } from "./query-persistence";
import { fitsQuerySnapshotBudget, MAX_QUERY_SNAPSHOT_BYTES } from "./query-snapshot-budget";
import { isPersistableKey } from "./query-provider";

const state = vi.hoisted(() => ({ generation: 0, save: vi.fn() }));
vi.mock("./local-snapshots", () => ({
  localSnapshotGeneration: () => state.generation,
  restoreLocalSnapshot: vi.fn(),
  saveLocalSnapshot: state.save,
}));
const snapshot = (buster: string, timestamp = 1): PersistedClient => ({
  timestamp, buster, clientState: { mutations: [], queries: [] },
});
function setup(preferredHashes?: () => ReadonlySet<string>) {
  const writes: Array<{ client: PersistedClient; finish: () => void }> = [];
  const storage = { setItem: vi.fn(), removeItem: vi.fn() } as unknown as Storage;
  state.save.mockImplementation((target: Storage, key: string, _slot: string, client: PersistedClient) =>
    new Promise<void>(resolve => writes.push({ client, finish: () => {
      target.setItem(key, `encrypted-${client.buster}`);
      resolve();
    } })));
  return { writes, storage, persister: createQueryStorage(storage, "cache", preferredHashes) };
}
beforeEach(() => { state.generation = 0; state.save.mockReset(); });

function oversizedWorkspace() {
  const client = new QueryClient();
  const rows = Array.from({ length: 670 }, (_, index) => ({ id: `issue-${index}`, description: "Complete scoped row", resource_count: index % 3 }));
  client.setQueryData(["me", "board"], { issues: [{ id: "large", description: "x".repeat(MAX_QUERY_SNAPSHOT_BYTES) }] });
  client.setQueryData(["issues", "project"], rows);
  client.setQueryData(["pages", "project"], [{ id: "page", title: "Page tree entry" }]);
  client.setQueryData(["page", "page"], { id: "page", content: "Memory-only body" });
  client.getMutationCache().build(client, { mutationKey: ["paused-write"], meta: { retryPolicy: "ordinary" } }, {
    context: { previousTitle: "Previous title" }, data: undefined, error: null, failureCount: 0, failureReason: null,
    isPaused: true, status: "pending", variables: { title: "Queued title" }, submittedAt: 123,
  });
  const value = { timestamp: 456, buster: "fallback", envelopeMetadata: { format: "test-metadata" },
    clientState: { ...dehydrate(client, { shouldDehydrateQuery: (query) => query.state.status === "success" && isPersistableKey(query.queryKey) }),
      stateMetadata: { revision: 7 } } };
  return { client, value, rows };
}

function scaled77Snapshot() {
  const client = new QueryClient();
  const rows = (count: number, project: string) => Array.from({ length: count }, (_, index) => ({
    id: `${project}-${index}`, project_id: project, title: `Complete ${project} item ${index}`,
    description: "Preserve the entire ordinary DTO. ".repeat(8), resource_count: index % 3,
  }));
  client.setQueryData(["me", "board"], { issues: rows(1440, "global"), padding: "" });
  client.setQueryData(["issues", "primary"], rows(670, "primary"));
  client.setQueryData(["issues", "foreign"], rows(100, "foreign"));
  client.setQueryData(["feedback", "primary", { statuses: ["open"] }], { posts: rows(96, "feedback"), board_enabled: true });
  client.setQueryData(["feedback", "primary"], { posts: rows(120, "feedback"), board_enabled: true });
  for (let index = 0; index < 72; index++) client.setQueryData(["optional-neighbor", index], { rows: rows(1, `neighbor-${index}`), padding: "" });
  const value = { ...snapshot("scaled-77", 123), clientState: dehydrate(client) };
  const bytes = (input: unknown) => new TextEncoder().encode(JSON.stringify(input)).byteLength;
  const global = value.clientState.queries[0].state.data as { padding: string };
  global.padding = "x".repeat(2_509_483 - bytes(value.clientState.queries[0]));
  const optional = value.clientState.queries.slice(5).map((query) => query.state.data as { padding: string });
  const perQuery = Math.floor((5_076_249 - bytes(value)) / optional.length);
  optional.forEach((data) => { data.padding = "y".repeat(perQuery); });
  optional.at(-1)!.padding += "y".repeat(5_076_249 - bytes(value));
  const preferredHashes = new Set(value.clientState.queries.slice(1, 4).map((query) => query.queryHash));
  return { client, value, bytes, preferredHashes };
}

it("preserves the measured 77-query counterexample and recovers only the complete preferred working set", async () => {
  const { client, value, bytes, preferredHashes } = scaled77Snapshot();
  const prefer = vi.fn(() => new Set([...preferredHashes, hashKey(["me", "board"]), "missing-nondehydrated-query"]));
  const { writes, storage, persister } = setup(prefer);
  try {
    expect(value.clientState.queries).toHaveLength(77);
    expect(bytes(value)).toBe(5_076_249);
    expect(bytes(value.clientState.queries[0])).toBe(2_509_483);
    const individuallyFiltered = { ...value, clientState: { ...value.clientState, queries: value.clientState.queries.slice(1) } };
    expect(bytes(individuallyFiltered)).toBe(2_566_765);
    expect(individuallyFiltered.clientState.queries.every((query) => fitsQuerySnapshotBudget(query))).toBe(true);
    expect(fitsQuerySnapshotBudget(individuallyFiltered)).toBe(false);
    expect(boundedQuerySnapshot(value)).toBeNull();
    const saved = persister.persistClient(value);
    expect(prefer).toHaveBeenCalledTimes(1);
    expect(writes[0].client.clientState.queries.map((query) => query.queryHash)).toEqual([...preferredHashes]);
    expect(writes[0].client.clientState.queries[0].state.data).toHaveLength(670);
    expect(writes[0].client.clientState.queries[1].state.data).toHaveLength(100);
    expect(writes[0].client.clientState.queries[2].state.data).toHaveProperty("posts.length", 96);
    expect(writes[0].client.clientState.mutations).toEqual(value.clientState.mutations);
    expect(fitsQuerySnapshotBudget(writes[0].client)).toBe(true);
    expect(value.clientState.queries).toHaveLength(77);
    expect(client.getQueryData(["me", "board"])).toHaveProperty("issues.length", 1440);
    writes[0].finish(); await saved;
    expect(storage.removeItem).not.toHaveBeenCalled();
  } finally { client.clear(); }
});

it("does not consult preferred hashes when the original or complete individually filtered envelope already fits", () => {
  const prefer = vi.fn(() => { throw new Error("Unnecessary preference callback"); });
  expect(boundedQuerySnapshot(snapshot("fits"), prefer)).not.toBeNull();
  const { client, value } = oversizedWorkspace();
  try {
    expect(boundedQuerySnapshot(value, prefer)?.clientState.queries).toHaveLength(2);
    expect(prefer).not.toHaveBeenCalled();
  } finally { client.clear(); }
});

it.each(["missing", "empty", "throws", "too-large"] as const)("removes obsolete storage when preferred admission is %s", async (kind) => {
  const { client, value } = scaled77Snapshot();
  const prefer = kind === "missing" ? undefined : () => {
    if (kind === "throws") throw new Error("Preference owner unavailable");
    return kind === "empty" ? new Set<string>() : new Set(value.clientState.queries.slice(1).map((query) => query.queryHash));
  };
  const { writes, storage, persister } = setup(prefer);
  try {
    await persister.persistClient(value);
    expect(writes).toHaveLength(0); expect(storage.removeItem).toHaveBeenCalledWith("cache");
    expect(value.clientState.queries).toHaveLength(77);
  } finally { client.clear(); }
});

it("preserves paused mutations and metadata when the preferred group is empty", async () => {
  const { client, value } = scaled77Snapshot();
  const { client: pausedClient, value: paused } = oversizedWorkspace();
  const withMutation = { ...value, envelopeMetadata: { owner: "test-account", revision: 9 },
    clientState: { ...value.clientState, mutations: paused.clientState.mutations } };
  const { writes, persister } = setup(() => new Set());
  try {
    const saved = persister.persistClient(withMutation);
    expect(writes).toHaveLength(1);
    expect(writes[0].client).toEqual({ ...withMutation,
      clientState: { ...withMutation.clientState, queries: [] } });
    writes[0].finish(); await saved;
  } finally { client.clear(); pausedClient.clear(); }
});

it("fences preferred snapshots after removal and account changes without mutating queued complete data", async () => {
  const { client, value, preferredHashes } = scaled77Snapshot();
  const { writes, storage, persister } = setup(() => preferredHashes);
  try {
    const first = persister.persistClient(snapshot("running"));
    const preferred = persister.persistClient(value);
    value.clientState.queries[1].state.data = [{ id: "later edit" }];
    writes[0].finish(); await first;
    expect(writes[1].client.clientState.queries[0].state.data).toHaveLength(670);
    state.generation++;
    writes[1].finish(); await preferred;
    expect(storage.setItem).not.toHaveBeenCalled();
    const next = persister.persistClient(value);
    await persister.removeClient(); writes[2].finish(); await next;
    expect(storage.setItem).not.toHaveBeenCalled();
  } finally { client.clear(); }
});

it("keeps a fitting snapshot unchanged, including more than the fallback inspection limit", async () => {
  const { writes, persister } = setup();
  const client = new QueryClient();
  for (let index = 0; index < 129; index++) client.setQueryData(["small", index], { id: index });
  const value = { ...snapshot("fits", 123), clientState: dehydrate(client) };
  try {
    expect(boundedQuerySnapshot(value)).toBe(value);
    const saved = persister.persistClient(value); writes[0].finish(); await saved;
    expect(writes[0].client).toEqual(value);
  } finally { client.clear(); }
});

it("seals all remaining complete queries and mutations after excluding one individually oversized global query", async () => {
  const { writes, storage, persister } = setup();
  const { client, value, rows } = oversizedWorkspace();
  const restored = new QueryClient();
  try {
    expect(fitsQuerySnapshotBudget(value)).toBe(false);
    const filtered = boundedQuerySnapshot(value)!;
    expect(filtered).not.toBeNull();
    expect(filtered.clientState.queries.map((query) => query.queryKey)).toEqual([["issues", "project"], ["pages", "project"]]);
    expect(filtered.clientState.queries[0]).toBe(value.clientState.queries[1]);
    expect(filtered.clientState.mutations).toBe(value.clientState.mutations);
    expect(fitsQuerySnapshotBudget(filtered)).toBe(true);
    const saved = persister.persistClient(value);
    expect(writes).toHaveLength(1); writes[0].finish(); await saved;
    expect(writes[0].client).toEqual(filtered);
    expect(storage.removeItem).not.toHaveBeenCalled();
    hydrate(restored, writes[0].client.clientState);
    expect(restored.getQueryData(["issues", "project"])).toEqual(rows);
    expect(restored.getQueryData<unknown[]>(["issues", "project"])).toHaveLength(670);
    expect(restored.getQueryData(["me", "board"])).toBeUndefined();
    expect(restored.getQueryData(["page", "page"])).toBeUndefined();
    expect(restored.getMutationCache().getAll()[0].state.variables).toEqual({ title: "Queued title" });
    expect(value.clientState.queries).toHaveLength(3);
    expect(client.getQueryData(["issues", "project"])).toBe(rows);
    expect(client.getQueryData(["me", "board"])).toHaveProperty("issues.0.description", "x".repeat(MAX_QUERY_SNAPSHOT_BYTES));
  } finally { client.clear(); restored.clear(); }
});

it("fails closed when individually fitting remaining queries still exceed the whole budget", async () => {
  const { writes, storage, persister } = setup();
  const client = new QueryClient();
  client.setQueryData(["first"], "x".repeat(MAX_QUERY_SNAPSHOT_BYTES * 0.6));
  client.setQueryData(["second"], "y".repeat(MAX_QUERY_SNAPSHOT_BYTES * 0.6));
  const value = { ...snapshot("combined"), clientState: dehydrate(client) };
  try {
    expect(value.clientState.queries.every((query) => fitsQuerySnapshotBudget(query))).toBe(true);
    await persister.persistClient(value);
    expect(writes).toHaveLength(0); expect(storage.removeItem).toHaveBeenCalledWith("cache");
  } finally { client.clear(); }
});

it("bounds fallback inspection and preserves an oversized mutation envelope rather than dropping writes", async () => {
  const { writes, storage, persister } = setup();
  const { client, value } = oversizedWorkspace();
  try {
    const tooMany = { ...value, clientState: { ...value.clientState, queries: Array(129).fill(value.clientState.queries[0]) } };
    expect(boundedQuerySnapshot(tooMany)).toBeNull();
    const mutationTooLarge = { ...value, clientState: { ...value.clientState, mutations: [{ ...value.clientState.mutations[0],
      state: { ...value.clientState.mutations[0].state, variables: "x".repeat(MAX_QUERY_SNAPSHOT_BYTES) } }] } };
    await persister.persistClient(mutationTooLarge);
    expect(writes).toHaveLength(0); expect(storage.removeItem).toHaveBeenCalledWith("cache");
  } finally { client.clear(); }
});

it("retains recoverable paused mutations when every optional query is excluded", async () => {
  const { writes, persister } = setup();
  const { client, value } = oversizedWorkspace();
  try {
    const onlyOversized = { ...value, clientState: { ...value.clientState, queries: [value.clientState.queries[0]] } };
    const saved = persister.persistClient(onlyOversized);
    expect(writes).toHaveLength(1);
    expect(writes[0].client.clientState.queries).toEqual([]);
    expect(writes[0].client.clientState.mutations).toEqual(value.clientState.mutations);
    writes[0].finish(); await saved;
  } finally { client.clear(); }
});

it("keeps the whole value-count budget when individually bounded complete queries combine", async () => {
  const { writes, storage, persister } = setup();
  const client = new QueryClient();
  client.setQueryData(["first"], Array(55_000).fill(null));
  client.setQueryData(["second"], Array(55_000).fill(null));
  const value = { ...snapshot("value-count"), clientState: dehydrate(client) };
  try {
    expect(value.clientState.queries.every((query) => fitsQuerySnapshotBudget(query))).toBe(true);
    expect(fitsQuerySnapshotBudget(value)).toBe(false);
    await persister.persistClient(value);
    expect(writes).toHaveLength(0); expect(storage.removeItem).toHaveBeenCalledWith("cache");
    expect(client.getQueryData<unknown[]>(["first"])).toHaveLength(55_000);
  } finally { client.clear(); }
});

it("rejects malformed envelope structure and getters without invoking them or serialization hooks", async () => {
  const { writes, storage, persister } = setup();
  const getter = vi.fn(() => { throw new Error("Accessor must not run"); });
  const invalid = [
    Object.defineProperty(snapshot("getter"), "clientState", { enumerable: true, get: getter }),
    { ...snapshot("mutations"), clientState: { mutations: "invalid", queries: [] } },
    { ...snapshot("queries"), clientState: { mutations: [], queries: [null] } },
    Object.defineProperty(snapshot("hook"), "toJSON", { value: getter }),
    Object.defineProperty(snapshot("metadata"), "metadata", { enumerable: true, get: getter }),
    { ...snapshot("sparse"), clientState: { mutations: [], queries: new Array(2) } },
  ];
  for (const value of invalid) await persister.persistClient(value as PersistedClient);
  expect(getter).not.toHaveBeenCalled(); expect(writes).toHaveLength(0);
  expect(storage.removeItem).toHaveBeenCalledTimes(invalid.length);
});

it("never invokes JSON-ignored symbol getters while preserving all enumerable envelope metadata", async () => {
  const { writes, persister } = setup();
  const getter = vi.fn(() => { throw new Error("Symbol getter must not run"); });
  const value = { ...snapshot("metadata", 987), extraMetadata: { revision: 2, owner: "test-account" } };
  Object.defineProperty(value, Symbol("ignored"), { enumerable: true, get: getter });
  expect(boundedQuerySnapshot(value)).toBe(value);
  const saved = persister.persistClient(value);
  expect(getter).not.toHaveBeenCalled(); writes[0].finish(); await saved;
  expect(writes[0].client).toEqual({ ...snapshot("metadata", 987), extraMetadata: { revision: 2, owner: "test-account" } });
  expect(getter).not.toHaveBeenCalled();
});

it("keeps filtered saves coalesced, immutable and fenced by later removal or account change", async () => {
  const { writes, storage, persister } = setup();
  const { client, value } = oversizedWorkspace();
  try {
    const first = persister.persistClient(snapshot("running"));
    const filtered = persister.persistClient(value);
    const repeated = persister.persistClient({ ...value, timestamp: 999 });
    value.clientState.queries[1].state.data = [{ id: "later live edit" }];
    writes[0].finish(); await first;
    expect(writes).toHaveLength(2);
    expect(writes[1].client.clientState.queries[0].state.data).toHaveLength(670);
    state.generation++;
    writes[1].finish(); await Promise.all([filtered, repeated]);
    expect(storage.setItem).not.toHaveBeenCalled();
    const retry = persister.persistClient(value);
    expect(writes).toHaveLength(3);
    await persister.removeClient(); writes[2].finish(); await retry;
    expect(storage.setItem).not.toHaveBeenCalled();
  } finally { client.clear(); }
});

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

it("skips an oversized snapshot before stringify and fences older writes while allowing smaller retries", async () => {
  const { writes, storage, persister } = setup();
  const first = persister.persistClient(snapshot("small"));
  const queued = persister.persistClient(snapshot("waiting"));
  const huge = snapshot("x".repeat(MAX_QUERY_SNAPSHOT_BYTES));
  const stringify = vi.spyOn(JSON, "stringify");
  await persister.persistClient(huge);
  expect(stringify).not.toHaveBeenCalled();
  stringify.mockRestore();
  expect(storage.removeItem).toHaveBeenCalledWith("cache");
  expect(writes).toHaveLength(1);
  // This equals the retired in-flight write, but must enqueue a fresh revision.
  const retry = persister.persistClient(snapshot("small"));
  writes[0].finish();
  await Promise.all([first, queued]);
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(writes).toHaveLength(2);
  writes[1].finish();
  await retry;
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith("cache", "encrypted-small");
});

it("keeps queued snapshot size stable when referenced cache data grows before the seal", async () => {
  const { writes, persister } = setup();
  const client = new QueryClient();
  const data = { title: "small" };
  client.setQueryData(["issues", "demo"], data);
  try {
    const first = persister.persistClient(snapshot("first"));
    const queued = persister.persistClient({ buster: "queued", timestamp: 1, clientState: dehydrate(client) });
    data.title = "x".repeat(MAX_QUERY_SNAPSHOT_BYTES);
    writes[0].finish();
    await first;
    expect(writes[1].client.clientState.queries[0].state.data).toEqual({ title: "small" });
    writes[1].finish();
    await queued;
  } finally { client.clear(); }
});
