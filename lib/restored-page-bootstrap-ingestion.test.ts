import { afterEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createRestoredPageBootstrapIngestion } from "./restored-page-bootstrap-ingestion";
import { observeRestoredPageBootstrapPriority } from "./restored-page-bootstrap-priority";
import { localSnapshotGeneration } from "./local-snapshots";
import { observePageReadFailures, pageReadState } from "./page-read-receipts";
import { issueWrites, objectiveWrites } from "./optimistic/issue-writes";
import { buildOptimisticPage } from "./optimistic-page";
import { isPreparedPageData } from "./use-pages-query";
import type { RestoredPageBootstrapRecord } from "./restored-page-bootstrap-types";
import type { Issue, MembersResponse, Objective } from "./types";

const clients: QueryClient[] = [];
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); issueWrites.reset(); objectiveWrites.reset(); });
const issue = (id = "issue", project_id = "project"): Issue => ({ id, project_id, title: "Accepted issue",
  updated_at: "2026-10-14T00:00:00Z", resource_count: 0 } as Issue);
const objective = (id = "objective", project_id = "project"): Objective => ({ id, project_id, name: "Accepted objective",
  updated_at: "2026-10-14T00:00:00Z" } as Objective);
const members: MembersResponse = { members: [{ user_id: "owner", role: "owner", is_owner: true, email: null,
  full_name: null, avatar_seed: "seed" }], invitations: [], isOwner: true };
function records(projectId = "project"): RestoredPageBootstrapRecord[] {
  const page = buildOptimisticPage(projectId, { id: `bootstrap-${projectId}`, title: "Accepted Page" }, []);
  const scope = { ownerId: "owner", projectId, complete: true as const };
  const { content: _body, ...summary } = page;
  return [{ ...scope, kind: "issues", data: [issue("issue", projectId)] },
    { ...scope, kind: "members", data: members }, { ...scope, kind: "objectives", data: [objective("objective", projectId)] },
    { ...scope, kind: "pages", data: [summary] }, { ...scope, kind: "page", pageId: page.id, data: page }];
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  const state = { owner: "owner" as string | null, client };
  const startedAt = Date.now() - 1000;
  observeRestoredPageBootstrapPriority(client, { startedAt });
  const options = { ownerId: "owner", startedAt, documentGeneration: localSnapshotGeneration(),
    currentOwner: () => state.owner, currentClient: () => state.client };
  return { client, state, startedAt, options, ingestion: createRestoredPageBootstrapIngestion(client, options) };
}
const ingest = (lease: ReturnType<typeof setup>["ingestion"], record = records()[0]) => lease.ingest(record, { isRestoring: false });

describe("restored Page server-record ingestion", () => {
  it("seeds exactly ten ordinary complete keys without requests or Page write authority", () => {
    const h = setup();
    for (const record of [...records(), ...records("foreign-project")]) expect(ingest(h.ingestion, record)).toBe("accepted");
    expect(h.client.getQueryCache().getAll()).toHaveLength(10);
    expect(h.client.getQueryData(["members", "project"])).toEqual(members);
    const query = h.client.getQueryCache().find({ queryKey: ["page", "bootstrap-project"], exact: true });
    expect(pageReadState(query)).toBeUndefined();
    expect(isPreparedPageData("bootstrap-project", h.startedAt)).toBe(false);
    expect(query?.state.dataUpdatedAt).toBe(h.startedAt);
    expect(query?.state.fetchStatus).toBe("idle");
    expect(h.client.getQueryData(["me", "board"])).toBeUndefined();
  });

  it("waits for restoration and remains idempotent without overwriting a complete tree", () => {
    const h = setup(), record = records()[3];
    if (record.kind !== "pages") throw new Error("Expected tree fixture");
    expect(h.ingestion.ingest(record, { isRestoring: true })).toBe("restoring");
    expect(h.client.getQueryCache().getAll()).toHaveLength(0);
    expect(ingest(h.ingestion, record)).toBe("accepted");
    expect(ingest(h.ingestion, record)).toBe("query-priority");
    const older = setup(), old = [{ ...record.data[0], title: "Preserved cached tree" }];
    older.client.setQueryData(["pages", "project"], old, { updatedAt: older.startedAt - 10 });
    expect(ingest(older.ingestion, record)).toBe("existing-tree");
    expect(older.client.getQueryData(["pages", "project"])).toBe(old);
  });

  it.each(["disposed", "owner", "client", "generation"])("fences %s retirement before any cache mutation", (kind) => {
    const h = setup();
    let lease = h.ingestion;
    if (kind === "disposed") lease.dispose();
    if (kind === "owner") h.state.owner = "replacement";
    if (kind === "client") { h.state.client = new QueryClient(); clients.push(h.state.client); }
    if (kind === "generation") lease = createRestoredPageBootstrapIngestion(h.client, { ...h.options,
      documentGeneration: h.options.documentGeneration - 1 });
    expect(ingest(lease)).toBe("retired");
    expect(h.client.getQueryCache().getAll()).toHaveLength(0);
    expect(h.state.client.getQueryCache().getAll()).toHaveLength(0);
  });

  it.each(["scope", "incomplete", "duplicate", "missing-count", "foreign-invitation"])("rejects the whole %s record", (kind) => {
    const h = setup();
    let record: RestoredPageBootstrapRecord = records()[0];
    if (kind === "scope") record = { ...record, data: [issue("issue", "other")] } as RestoredPageBootstrapRecord;
    if (kind === "incomplete") record = { ...record, complete: false } as unknown as RestoredPageBootstrapRecord;
    if (kind === "duplicate") record = { ...record, data: [issue(), issue()] } as RestoredPageBootstrapRecord;
    if (kind === "missing-count") record = { ...record, data: [{ ...issue(), resource_count: undefined }] } as RestoredPageBootstrapRecord;
    if (kind === "foreign-invitation") record = { ...records()[1], data: { ...members, invitations: [{ id: "invite",
      project_id: "other", invited_email: "synthetic@example.test", status: "pending", created_at: "2026-10-14T00:00:00Z" }] } } as RestoredPageBootstrapRecord;
    expect(ingest(h.ingestion, record)).toBe("invalid-record");
    expect(h.client.getQueryCache().getAll()).toHaveLength(0);
  });

  it.each(["new-data", "invalidation", "failure", "fetching"])("yields to existing foreground %s", async (kind) => {
    const h = setup(), key = ["issues", "project"];
    const before = [issue("existing")];
    h.client.setQueryData(key, before, { updatedAt: kind === "new-data" ? Date.now() : h.startedAt - 10 });
    if (kind === "invalidation") await h.client.invalidateQueries({ queryKey: key, refetchType: "none" });
    if (kind === "failure") await h.client.fetchQuery({ queryKey: key, queryFn: async () => { throw new Error("Denied"); }, staleTime: 0 }).catch(() => {});
    let release!: (rows: Issue[]) => void;
    const reading = kind === "fetching" ? h.client.fetchQuery({ queryKey: key, queryFn: () => new Promise<Issue[]>((resolve) => { release = resolve; }), staleTime: 0 }) : undefined;
    expect(ingest(h.ingestion)).toBe("query-priority");
    expect(h.client.getQueryData(key)).toEqual(before);
    if (reading) { release(before); await reading; }
  });

  it("never replaces an existing Page or clears retained denial after manual query success", async () => {
    const h = setup(), record = records()[4];
    if (record.kind !== "page") throw new Error("Expected Page fixture");
    const key = ["page", record.pageId]; observePageReadFailures(h.client);
    const denied = new Error("Denied");
    await h.client.fetchQuery({ queryKey: key, queryFn: async () => { throw denied; } }).catch(() => {});
    const local = { ...record.data, title: "Local retained body", version: 99 };
    h.client.setQueryData(key, local, { updatedAt: h.startedAt - 1 });
    expect(ingest(h.ingestion, record)).toBe("query-priority");
    expect(h.client.getQueryData(key)).toEqual(local);
    expect(pageReadState(h.client.getQueryCache().find({ queryKey: key, exact: true }))?.failure).toBe(denied);
  });

  it.each(["denial", "invalidation", "accepted-write", "trash"])("does not resurrect a Page after %s removes its Query", async (kind) => {
    const h = setup(), record = records()[4];
    if (record.kind !== "page") throw new Error("Expected Page fixture");
    const key = ["page", record.pageId];
    if (kind === "denial") await h.client.fetchQuery({ queryKey: key, queryFn: async () => { throw new Error("Denied"); } }).catch(() => {});
    else {
      h.client.setQueryData(key, record.data, { updatedAt: h.startedAt - 1 });
      if (kind === "invalidation") await h.client.invalidateQueries({ queryKey: key, refetchType: "none" });
      if (kind === "accepted-write") h.client.setQueryData(key, { ...record.data, version: 6 });
    }
    h.client.removeQueries({ queryKey: key, exact: true });
    expect(ingest(h.ingestion, record)).toBe("query-priority");
    expect(h.client.getQueryCache().find({ queryKey: key, exact: true })).toBeUndefined();
  });

  it.each(["issues", "objectives"] as const)("retains ordinary %s patches and rejects pending insert collections as a whole", (kind) => {
    const h = setup(), record = records().find((record) => record.kind === kind)!;
    if (kind === "issues") {
      const patch = issueWrites.begin({ kind: "patch", id: "issue", patch: { title: "Latest local issue" } });
      issueWrites.settle(patch, { title: "Latest local issue" });
    } else {
      const patch = objectiveWrites.begin({ kind: "patch", id: "objective", patch: { name: "Latest local objective" } });
      objectiveWrites.settle(patch, { name: "Latest local objective" });
    }
    expect(ingest(h.ingestion, record)).toBe("accepted");
    expect(h.client.getQueryData<{ title?: string; name?: string }[]>([kind, "project"])?.[0]).toMatchObject(kind === "issues"
      ? { title: "Latest local issue" } : { name: "Latest local objective" });
    const empty = setup();
    if (kind === "issues") issueWrites.begin({ kind: "insert", row: issue("pending") });
    else objectiveWrites.begin({ kind: "insert", row: objective("pending") });
    expect(ingest(empty.ingestion, record)).toBe("pending-insert");
    expect(empty.client.getQueryData([kind, "project"])).toBeUndefined();
  });
});
