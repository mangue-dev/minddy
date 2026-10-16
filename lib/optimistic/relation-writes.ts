"use client";

import type { QueryClient } from "@tanstack/react-query";
import { normalizeRelation } from "../relation-constants";
import type { CreateIssueRelationInput, GlobalBoardResponse, IssueRelation } from "../types";

const boardKey = ["me", "board"] as const;
export const relationsKey = (projectId: string) => ["issue-relations", projectId] as const;
const retentionMs = 30_000;
const temporaryPrefix = "optimistic-relation:";

interface Write {
  projectId: string;
  row: IssueRelation;
  settledAt: number | null;
  result: Promise<IssueRelation>;
}

interface Removal {
  projectId: string;
  id: string;
  settledAt: number | null;
}

const writes = new WeakMap<QueryClient, Set<Write>>();
const removals = new WeakMap<QueryClient, Set<Removal>>();

function retained<T extends { settledAt: number | null }>(registry: WeakMap<QueryClient, Set<T>>, client: QueryClient): Set<T> {
  let pending = registry.get(client);
  if (!pending) {
    pending = new Set();
    registry.set(client, pending);
  }
  for (const entry of pending) {
    if (entry.settledAt !== null && entry.settledAt <= Date.now() - retentionMs) pending.delete(entry);
  }
  return pending;
}

const pendingWrites = (client: QueryClient) => retained(writes, client);
const pendingRemovals = (client: QueryClient) => retained(removals, client);

function sameRelation(a: IssueRelation, b: IssueRelation): boolean {
  const left = normalizeRelation({ id: a.source_id, type: a.source_type }, a.type, { id: a.target_id, type: a.target_type });
  const right = normalizeRelation({ id: b.source_id, type: b.source_type }, b.type, { id: b.target_id, type: b.target_type });
  return left.source_id === right.source_id && left.target_id === right.target_id
    && left.source_type === right.source_type && left.target_type === right.target_type && left.type === right.type;
}

function mergeRelation(rows: IssueRelation[], row: IssueRelation): IssueRelation[] {
  // A realtime echo may already carry the real ID while the POST is pending.
  if (row.id.startsWith(temporaryPrefix) && rows.some((r) => !r.id.startsWith(temporaryPrefix) && sameRelation(r, row))) return rows;
  return [...rows.filter((r) => r.id !== row.id && !sameRelation(r, row)), row];
}

/** Protect project and aggregate GET responses that started before confirmation. */
export function applyPendingRelations(client: QueryClient | undefined, rows: IssueRelation[], startedAt: number, projectId?: string): IssueRelation[] {
  if (!client) return rows;
  let result = rows;
  for (const write of pendingWrites(client)) {
    if (projectId && write.projectId !== projectId) continue;
    if (write.settledAt !== null && write.settledAt <= startedAt) continue;
    result = mergeRelation(result, write.row);
  }
  for (const removal of pendingRemovals(client)) {
    if (projectId && removal.projectId !== projectId) continue;
    if (removal.settledAt !== null && removal.settledAt <= startedAt) continue;
    if (result.some((row) => row.id === removal.id)) result = result.filter((row) => row.id !== removal.id);
  }
  return result;
}

/**
 * Keep a removed row out of project and aggregate GET responses that started
 * before the DELETE was confirmed, so the caller can drop the row locally
 * without refetching to outrun such a response.
 */
export function beginRelationRemoval(client: QueryClient, projectId: string, id: string): { settle(): void; fail(): void } {
  const removal: Removal = { projectId, id, settledAt: null };
  pendingRemovals(client).add(removal);
  return {
    settle: () => { removal.settledAt = Date.now(); },
    fail: () => { pendingRemovals(client).delete(removal); },
  };
}

/**
 * Whether a relation broadcast echoes a write this client made and already
 * holds in its caches: an addition in flight for the same endpoints, an
 * acknowledged addition with this id, or a removal of this id.
 */
export function isOwnRelationEcho(client: QueryClient, change: { operation: string; record: Record<string, unknown> | null; old_record: Record<string, unknown> | null }): boolean {
  if (change.operation === "DELETE") {
    const id = (change.old_record ?? change.record)?.id;
    return typeof id === "string" && [...pendingRemovals(client)].some((removal) => removal.id === id);
  }
  const row = change.record as IssueRelation | null;
  if (change.operation !== "INSERT" || !row || typeof row.id !== "string") return false;
  return [...pendingWrites(client)].some((write) =>
    write.row.id === row.id || (write.settledAt === null && sameRelation(write.row, row)));
}

function updateCaches(client: QueryClient, projectId: string, update: (rows: IssueRelation[]) => IssueRelation[]): void {
  client.setQueryData<IssueRelation[]>(relationsKey(projectId), (old) => old === undefined ? old : update(old));
  client.setQueryData<GlobalBoardResponse>(boardKey, (old) => old ? { ...old, relations: update(old.relations) } : old);
}

/** Insert synchronously; reconcile or roll back only this addition. */
export function addRelationOptimistically(client: QueryClient, projectId: string, input: CreateIssueRelationInput, save: () => Promise<IssueRelation>): Promise<IssueRelation> {
  const row: IssueRelation = {
    id: `${temporaryPrefix}${crypto.randomUUID()}`,
    ...normalizeRelation({ id: input.source_id, type: input.source_type }, input.type, { id: input.target_id, type: input.target_type }),
  };
  const pending = pendingWrites(client);
  const duplicate = [...pending].find((w) => w.projectId === projectId && w.settledAt === null && sameRelation(w.row, row));
  if (duplicate) return duplicate.result;

  void client.cancelQueries({ queryKey: relationsKey(projectId) });
  // The aggregate read is not cancelled: its query function applies this
  // write, and restarting it would repeat a multi-second server read.
  const write: Write = { projectId, row, settledAt: null, result: Promise.resolve(row) };
  pending.add(write);
  updateCaches(client, projectId, (rows) => mergeRelation(rows, row));
  write.result = save().then((created) => {
    write.row = created;
    write.settledAt = Date.now();
    updateCaches(client, projectId, (rows) => mergeRelation(rows.filter((r) => r.id !== row.id), created));
    return created;
  }, (error: unknown) => {
    pending.delete(write);
    updateCaches(client, projectId, (rows) => applyPendingRelations(client, rows.filter((r) => r.id !== row.id), 0, projectId));
    throw error;
  });
  return write.result;
}

/** Stop protecting an addition when removal or undo takes ownership of the row. */
export function forgetRelationWrite(client: QueryClient, id: string): void {
  for (const write of pendingWrites(client)) {
    if (write.row.id === id) pendingWrites(client).delete(write);
  }
}

/** Resolve a temporary ID before sending a removal to the server. */
export async function persistedRelationId(client: QueryClient, id: string): Promise<string> {
  const pending = pendingWrites(client);
  const write = [...pending].find((w) => w.row.id === id);
  if (!write) return id;
  const created = await write.result;
  pending.delete(write);
  return created.id;
}
