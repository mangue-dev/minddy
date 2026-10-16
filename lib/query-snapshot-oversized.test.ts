import { afterEach, expect, it, vi } from "vitest";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { createQueryStorage } from "./query-persistence";
import { fitsQuerySnapshotBudget, MAX_QUERY_SNAPSHOT_BYTES } from "./query-snapshot-budget";

vi.mock("./query-snapshot-budget", async (original) => {
  const actual = await original<typeof import("./query-snapshot-budget")>();
  return { ...actual, fitsQuerySnapshotBudget: vi.fn(actual.fitsQuerySnapshotBudget) };
});
vi.mock("./local-snapshots", () => ({
  localSnapshotGeneration: () => 0,
  restoreLocalSnapshot: vi.fn(),
  saveLocalSnapshot: vi.fn(async () => {}),
}));

const clients: QueryClient[] = [];
afterEach(() => { for (const client of clients.splice(0)) client.clear(); vi.mocked(fitsQuerySnapshotBudget).mockClear(); });

function workspace(boardText: string) {
  const client = new QueryClient();
  clients.push(client);
  client.setQueryData(["me", "board"], { issues: [{ id: "large", description: boardText }] });
  client.setQueryData(["issues", "project"], [{ id: "issue", title: "Small row" }]);
  client.setQueryData(["pages", "project"], [{ id: "page", title: "Page tree entry" }]);
  return client;
}
const snapshot = (client: QueryClient, timestamp: number): PersistedClient =>
  ({ timestamp, buster: "oversized", clientState: dehydrate(client) });
/** Budget walks that reach the board payload, whether alone, in its query or in a whole snapshot. */
function boardWalks(board: unknown) {
  return vi.mocked(fitsQuerySnapshotBudget).mock.calls.filter(([value]) => {
    const item = value as { state?: { data?: unknown }; clientState?: { queries: { state: { data?: unknown } }[] } };
    return value === board || item?.state?.data === board || !!item?.clientState?.queries.some((query) => query.state.data === board);
  }).length;
}

it("stops walking a never-persistable payload once it is known to exceed the budget", async () => {
  const client = workspace("x".repeat(MAX_QUERY_SNAPSHOT_BYTES));
  const board = client.getQueryData(["me", "board"]);
  const persister = createQueryStorage({ setItem: vi.fn(), removeItem: vi.fn() } as unknown as Storage, "cache");
  const walks: number[] = [];
  const saved: PersistedClient[] = [];
  const save = vi.mocked((await import("./local-snapshots")).saveLocalSnapshot);
  for (let timestamp = 1; timestamp <= 3; timestamp++) {
    vi.mocked(fitsQuerySnapshotBudget).mockClear();
    // Each save carries another optional change, as an autosave acknowledgement does.
    client.setQueryData(["pages", "project"], [{ id: "page", title: `Page tree entry ${timestamp}` }]);
    await persister.persistClient(snapshot(client, timestamp));
    walks.push(boardWalks(board));
    saved.push(save.mock.calls.at(-1)![3] as PersistedClient);
  }
  // Learned on the second save (the previous code walked it twice on every save).
  expect(walks).toEqual([2, 1, 0]);
  for (const value of saved) {
    expect(value.clientState.queries.map((query) => query.queryKey[0])).toEqual(["issues", "pages"]);
  }

  // A payload that shrank under the budget under the same key is admitted again.
  client.setQueryData(["me", "board"], { issues: [{ id: "small", description: "Fits" }] });
  await persister.persistClient(snapshot(client, 4));
  expect((save.mock.calls.at(-1)![3] as PersistedClient).clientState.queries.map((query) => query.queryKey[0]))
    .toEqual(["me", "issues", "pages"]);
});
