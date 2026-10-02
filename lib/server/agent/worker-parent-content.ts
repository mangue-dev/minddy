import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { legacyAgentLaunchSchema } from "./run-launch-content";

function context(projectId: string, messageId: string) {
  if (!projectId || !messageId) throw new Error("Worker parent message scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "assistant_messages", column: "content", rowId: messageId };
}

export type WorkerParentContent = {
  content: string;
  context: object | null;
  metadata: Record<string, unknown>;
};

export async function encodeWorkerParentMessage(projectId: string,
  messageId: string, value: WorkerParentContent) {
  const store = getEncryptedStore();
  const encrypted = await store.encrypt(value, context(projectId, messageId));
  return { content: encrypted, worker_content_encryption_version: store.versionOf(encrypted) };
}

export async function decodeWorkerParentMessage<T extends {
  id: string; content: string | null; worker_content_encryption_version?: number;
  context?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}>(projectId: string, row: T, actorId: string | null = null): Promise<T> {
  const version = row.worker_content_encryption_version ?? 0;
  if (version === 0) return row;
  if (!Number.isSafeInteger(version) || version < 1 || !row.content) {
    throw new Error("Invalid encrypted worker parent message");
  }
  const binding = context(projectId, row.id);
  const store = getEncryptedStore();
  const encrypted = store.fromDatabase<WorkerParentContent>(row.content);
  if (store.versionOf(encrypted) !== version) throw new Error("Worker parent key version mismatch");
  const clear = await store.decrypt(encrypted, binding);
  if (!clear || typeof clear !== "object" || Array.isArray(clear) ||
      typeof clear.content !== "string" ||
      !clear.metadata || typeof clear.metadata !== "object" ||
      Array.isArray(clear.metadata) ||
      clear.context !== null && (typeof clear.context !== "object" ||
        Array.isArray(clear.context))) {
    throw new Error("Invalid worker parent message");
  }
  auditDecryption(binding, { actorId, reason: "repository_read" });
  return { ...row, content: clear.content, context: clear.context as T["context"],
    metadata: { ...row.metadata, ...clear.metadata } };
}

/** Hydrate only worker-origin copies already visible through the caller's RLS query. */
export async function hydrateWorkerParentCopies<T extends Record<string, unknown>>(
  client: SupabaseClient, rows: T[], actorId: string | null = null,
): Promise<T[]> {
  const isWorkerCopy = (row: T) => (row.source === "assistant" ||
    !Object.hasOwn(row, "source")) && typeof row.id === "string" &&
    !!row.metadata && typeof row.metadata === "object" &&
    (Object.hasOwn(row.metadata, "worker_input") ||
      Object.hasOwn(row.metadata, "worker_steering"));
  const ids = [...new Set(rows.filter(isWorkerCopy).map((row) => row.id as string))];
  if (!ids.length) return rows;
  type Parent = { id: string; content: string | null;
    worker_content_encryption_version: number;
    context: Record<string, unknown> | null;
    metadata: { worker_input?: { run_id?: string };
      worker_steering?: { run_id?: string } } | null };
  const stored = new Map<string, Parent>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const first = await client.from("assistant_messages")
      .select("id,content,context,worker_content_encryption_version,metadata")
      .in("id", ids.slice(offset, offset + 100));
    const { data, error } = legacyAgentLaunchSchema(first.error)
      ? await client.from("assistant_messages")
          .select("id,content,context,metadata")
          .in("id", ids.slice(offset, offset + 100))
      : first;
    if (error) throw new Error("Unable to read worker parent messages");
    for (const row of (data ?? []) as Parent[]) stored.set(row.id, row);
  }
  const runIds = [...new Set([...stored.values()].filter((row) =>
    row.worker_content_encryption_version > 0).map((row) =>
    row.metadata?.worker_input?.run_id ?? row.metadata?.worker_steering?.run_id)
    .filter((id): id is string => typeof id === "string"))];
  const projects = new Map<string, string>();
  for (let offset = 0; offset < runIds.length; offset += 100) {
    const { data, error } = await client.from("agent_runs")
      .select("id,project_id").in("id", runIds.slice(offset, offset + 100));
    if (error) throw new Error("Unable to resolve worker parent project");
    for (const run of data ?? []) projects.set(run.id, run.project_id);
  }
  return Promise.all(rows.map(async (row) => {
    if (!isWorkerCopy(row)) return row;
    const source = stored.get(row.id as string);
    if (!source || source.content !== row.content) {
      throw new Error("Worker parent copy is not authorized");
    }
    if (!source.worker_content_encryption_version) return row;
    const runId = source.metadata?.worker_input?.run_id ??
      source.metadata?.worker_steering?.run_id;
    const projectId = runId && projects.get(runId);
    if (!projectId) throw new Error("Worker parent project is not authorized");
    const decoded = await decodeWorkerParentMessage(projectId, source, actorId);
    return { ...row, content: decoded.content,
      context: decoded.context, metadata: decoded.metadata };
  }));
}
