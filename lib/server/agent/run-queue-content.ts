import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantMention } from "@/lib/assistant-types";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { legacyAgentLaunchSchema, shouldEncryptAgentLaunch } from "./run-launch-content";

export type QueuedContent = {
  content: string;
  mentions: AssistantMention[] | null;
};

export type StoredQueueMessage = QueuedContent & {
  id: string;
  run_id: string;
  content_encryption_version?: number;
};

function binding(projectId: string, messageId: string) {
  if (!projectId || !messageId) throw new Error("Agent queue scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_run_messages", column: "content", rowId: messageId };
}

export async function encodeQueueMessage(projectId: string, messageId: string,
  value: QueuedContent) {
  const store = getEncryptedStore();
  const content = await store.encrypt(value, binding(projectId, messageId));
  return { content, mentions: null, content_encryption_version: store.versionOf(content) };
}

export async function decodeQueueMessage<T extends StoredQueueMessage>(
  projectId: string, row: T, actorId: string | null = null,
): Promise<T> {
  const version = row.content_encryption_version ?? 0;
  if (version === 0) return row;
  if (!Number.isSafeInteger(version) || version < 1 || row.mentions !== null) {
    throw new Error("Invalid encrypted agent queue message");
  }
  const context = binding(projectId, row.id);
  const store = getEncryptedStore();
  const encrypted = store.fromDatabase<QueuedContent>(row.content);
  if (store.versionOf(encrypted) !== version) throw new Error("Agent queue key version mismatch");
  const decoded = await store.decrypt(encrypted, context);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) ||
      typeof decoded.content !== "string" ||
      decoded.mentions !== null && !Array.isArray(decoded.mentions)) {
    throw new Error("Invalid agent queue content");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return { ...row, content: decoded.content, mentions: decoded.mentions };
}

export async function queueMessageValues(service: SupabaseClient, runId: string,
  messageId: string, value: QueuedContent) {
  const { data, error } = await service.from("agent_runs")
    .select("project_id").eq("id", runId).maybeSingle();
  if (error || !data?.project_id) throw new Error("Unable to resolve agent queue project");
  if (!await shouldEncryptAgentLaunch(service, data.project_id)) {
    return value;
  }
  return encodeQueueMessage(data.project_id, messageId, value);
}

/** The caller has already read the projected messages through its RLS client. */
export async function hydrateAgentQueueCopies<T extends Record<string, unknown>>(
  client: SupabaseClient, rows: T[], actorId: string | null = null,
  expectedProjectId: string | null = null,
): Promise<T[]> {
  const queueIds = [...new Set(rows.filter((row) =>
    (row.source === "agent" && row.worker_source === "steering" ||
      row.source === "steering") && typeof row.legacy_queue_message_id === "string")
    .map((row) => row.legacy_queue_message_id as string))];
  if (!queueIds.length) return rows;
  type QueueRow = StoredQueueMessage & { run: { project_id: string } | null };
  const stored = new Map<string, QueueRow>();
  for (let offset = 0; offset < queueIds.length; offset += 100) {
    const first = await client.from("agent_run_messages")
      .select("id,run_id,content,mentions,content_encryption_version,run:agent_runs!inner(project_id)")
      .in("id", queueIds.slice(offset, offset + 100));
    const { data, error } = legacyAgentLaunchSchema(first.error)
      ? await client.from("agent_run_messages")
          .select("id,run_id,content,mentions,run:agent_runs!inner(project_id)")
          .in("id", queueIds.slice(offset, offset + 100))
      : first;
    if (error) throw new Error("Unable to read agent queue copies");
    for (const row of (data ?? []) as unknown as QueueRow[]) stored.set(row.id, row);
  }
  return Promise.all(rows.map(async (row) => {
    if (typeof row.legacy_queue_message_id !== "string" ||
        !queueIds.includes(row.legacy_queue_message_id)) return row;
    const source = stored.get(row.legacy_queue_message_id);
    const projectId = source?.run?.project_id;
    if (!source || !projectId || expectedProjectId && expectedProjectId !== projectId ||
        source.run_id !== row.run_id || source.content !== row.content) {
      throw new Error("Agent queue copy is not authorized");
    }
    const decoded = await decodeQueueMessage(projectId, source, actorId);
    return { ...row, content: decoded.content };
  }));
}
