import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { localSnapshotGeneration } from "./local-snapshots";
import { isPageCreationPending } from "./page-creation-settlement";
import { applyPendingIssues, applyPendingObjectives, issueWrites, objectiveWrites } from "./optimistic/issue-writes";
import type { RestoredPageBootstrapRecord } from "./restored-page-bootstrap-types";
import { restoredPageBootstrapPriority } from "./restored-page-bootstrap-priority";

type Options = {
  ownerId: string;
  startedAt: number;
  documentGeneration: number;
  currentOwner: () => string | null;
  currentClient: () => QueryClient;
};
export type RestoredPageBootstrapOutcome = "accepted" | "restoring" | "retired" | "invalid-record" |
  "query-priority" | "existing-page" | "existing-tree" | "pending-insert";

function scopedRows(rows: unknown, projectId: string): rows is { id: string; project_id: string }[] {
  if (!Array.isArray(rows)) return false;
  const ids = new Set<string>();
  return rows.every((row) => {
    if (!row || typeof row.id !== "string" || !row.id || row.project_id !== projectId || ids.has(row.id)) return false;
    ids.add(row.id);
    return true;
  });
}

function validRecord(record: RestoredPageBootstrapRecord): boolean {
  if (!record || record.complete !== true || typeof record.ownerId !== "string" || !record.ownerId ||
      typeof record.projectId !== "string" || !record.projectId) return false;
  if (record.kind === "page") return typeof record.pageId === "string" && !!record.pageId && record.pageId === record.data?.id && record.data.project_id === record.projectId &&
    Object.hasOwn(record.data, "content") &&
    Number.isInteger(record.data.version) && record.data.version > 0;
  if (record.kind === "members") {
    const value = record.data;
    return !!value && typeof value.isOwner === "boolean" && Array.isArray(value.members) &&
      value.members.every((member) => !!member && typeof member.user_id === "string" && member.user_id) &&
      new Set(value.members.map((member) => member.user_id)).size === value.members.length &&
      scopedRows(value.invitations, record.projectId);
  }
  if (!["issues", "objectives", "pages"].includes(record.kind) || !scopedRows(record.data, record.projectId)) return false;
  return record.kind !== "issues" || record.data.every((issue) =>
    typeof issue.resource_count === "number" && Number.isFinite(issue.resource_count) && issue.resource_count >= 0);
}

/** One synchronous ingestion owner; retired account/document records never become cache authority. */
export function createRestoredPageBootstrapIngestion(client: QueryClient, options: Options) {
  let disposed = false;
  const current = () => !disposed && options.documentGeneration === localSnapshotGeneration() &&
    options.currentOwner() === options.ownerId && options.currentClient() === client;
  return {
    ingest(record: RestoredPageBootstrapRecord, { isRestoring }: { isRestoring: boolean }): RestoredPageBootstrapOutcome {
      if (!current()) return "retired";
      if (!Number.isFinite(options.startedAt) || options.startedAt <= 0 || options.startedAt > Date.now() ||
          !validRecord(record) || record.ownerId !== options.ownerId) return "invalid-record";
      if (isRestoring) return "restoring";
      const key: QueryKey = record.kind === "page" ? ["page", record.pageId] : [record.kind, record.projectId];
      if (restoredPageBootstrapPriority(client, key) !== "admissible") return "query-priority";
      const query = client.getQueryCache().find({ queryKey: key, exact: true });
      // Any existing Page Query may own a body, a draft or an actual receipt.
      // Never place another body under that authority, including equal versions.
      if (record.kind === "page" && (query || isPageCreationPending(record.pageId))) return "existing-page";
      if (query && (query.state.fetchStatus !== "idle" || query.state.status === "error" || query.state.error ||
          query.state.isInvalidated || query.state.dataUpdatedAt >= options.startedAt)) return "query-priority";
      if (record.kind === "pages" && query?.state.data !== undefined) return "existing-tree";
      let data: unknown = record.data;
      if (record.kind === "issues") {
        const rows = applyPendingIssues(record.data, options.startedAt, record.projectId);
        const existing = client.getQueryData<{ id: string }[]>(key) ?? [];
        if ([...rows, ...existing].some((row) => issueWrites.hasUnsettledInsert(row.id))) return "pending-insert";
        data = rows;
      } else if (record.kind === "objectives") {
        const rows = applyPendingObjectives(record.data, options.startedAt, record.projectId);
        const existing = client.getQueryData<{ id: string }[]>(key) ?? [];
        if ([...rows, ...existing].some((row) => objectiveWrites.hasUnsettledInsert(row.id))) return "pending-insert";
        data = rows;
      } else if (record.kind === "pages" && record.data.some((page) => isPageCreationPending(page.id))) return "pending-insert";
      if (!current()) return "retired";
      // This is display ingestion, not a client GET receipt or a preparation
      // lease. Keep the original navigation start rather than arrival freshness.
      client.setQueryData(key, data, { updatedAt: options.startedAt });
      return "accepted";
    },
    dispose() { disposed = true; },
  };
}
