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

const writes = new WeakMap<QueryClient, Set<Write>>();

function pendingWrites(client: QueryClient): Set<Write> {
  let pending = writes.get(client);
  if (!pending) {
    pending = new Set();
    writes.set(client, pending);
  }
  for (const write of pending) {
    if (write.settledAt !== null && write.settledAt <= Date.now() - retentionMs) pending.delete(write);
  }
  return pending;
}

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
  return result;
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
  void client.cancelQueries({ queryKey: boardKey });
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
