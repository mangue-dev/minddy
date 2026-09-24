import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantMention } from "@/lib/assistant-types";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

type LaunchContent = {
  prompt: string | null;
  prompt_mentions: AssistantMention[] | null;
};

export function legacyAgentLaunchSchema(error: { code?: string } | null): boolean {
  return process.env.MINDDY_AGENT_LAUNCH_ENCRYPTION_ENABLED !== "true" &&
    (error?.code === "42703" || error?.code === "PGRST204");
}

export type StoredLaunch = LaunchContent & {
  id: string;
  project_id: string;
  conversation_id?: string;
  encrypted_launch_content?: string | null;
  launch_encryption_version?: number;
};

function context(projectId: string, runId: string) {
  if (!projectId || !runId) throw new Error("Agent launch scope is required");
  return {
    scope: { kind: "project" as const, id: projectId },
    table: "agent_runs", column: "launch_content", rowId: runId,
  };
}

export async function shouldEncryptAgentLaunch(service: SupabaseClient, projectId: string) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_LAUNCH_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_launch_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent launch encryption state");
  }
  return !!data;
}

export async function encodeAgentLaunch(
  projectId: string, runId: string, value: LaunchContent,
) {
  const store = getEncryptedStore();
  const encrypted = await store.encrypt(value, context(projectId, runId));
  return {
    prompt: null, prompt_mentions: null,
    encrypted_launch_content: encrypted,
    launch_encryption_version: store.versionOf(encrypted),
    has_launch_prompt: !!value.prompt?.trim(),
  };
}

export async function decodeAgentLaunch<T extends StoredLaunch>(
  row: T, actorId: string | null = null,
): Promise<T> {
  const version = row.launch_encryption_version ?? 0;
  if (version === 0) {
    if (row.encrypted_launch_content != null) throw new Error("Invalid legacy agent launch");
    return row;
  }
  if (!Number.isSafeInteger(version) || version < 1 || row.prompt !== null ||
      row.prompt_mentions !== null || typeof row.encrypted_launch_content !== "string") {
    throw new Error("Invalid encrypted agent launch");
  }
  const binding = context(row.project_id, row.id);
  const store = getEncryptedStore();
  const encrypted = store.fromDatabase<LaunchContent>(row.encrypted_launch_content);
  if (store.versionOf(encrypted) !== version) throw new Error("Agent launch key version mismatch");
  const value = await store.decrypt(encrypted, binding);
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (value.prompt !== null && typeof value.prompt !== "string") ||
      (value.prompt_mentions !== null && !Array.isArray(value.prompt_mentions))) {
    throw new Error("Invalid agent launch content");
  }
  auditDecryption(binding, { actorId, reason: "repository_read" });
  return { ...row, prompt: value.prompt, prompt_mentions: value.prompt_mentions };
}

/** Resolve only initial-message copies visible through the caller's RLS query. */
export async function hydrateAgentLaunchCopies<T extends Record<string, unknown>>(
  client: SupabaseClient, rows: T[], actorId: string | null = null,
  expectedProjectId: string | null = null,
): Promise<T[]> {
  const isInitial = (row: T) => row.source === "initial_prompt" ||
    row.source === "agent" && row.worker_source === "initial_prompt";
  const ids = [...new Set(rows.filter((row) => isInitial(row) &&
    typeof row.run_id === "string").map((row) => row.run_id as string))];
  if (!ids.length) return rows;
  const runs = new Map<string, StoredLaunch>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const first = await client.from("agent_runs")
      .select("id,project_id,prompt,prompt_mentions,encrypted_launch_content,launch_encryption_version")
      .in("id", ids.slice(offset, offset + 100));
    let data = first.data as StoredLaunch[] | null;
    let error = first.error;
    if (legacyAgentLaunchSchema(error)) {
      const legacy = await client.from("agent_runs")
        .select("id,project_id,prompt,prompt_mentions")
        .in("id", ids.slice(offset, offset + 100));
      data = legacy.data as StoredLaunch[] | null;
      error = legacy.error;
    }
    if (error) throw new Error("Unable to read initial agent prompts");
    for (const run of data ?? []) runs.set(run.id, run as StoredLaunch);
  }
  return Promise.all(rows.map(async (row) => {
    if (!isInitial(row) || typeof row.run_id !== "string") return row;
    const run = runs.get(row.run_id);
    if (!run || expectedProjectId && run.project_id !== expectedProjectId) {
      throw new Error("Initial agent prompt is not authorized");
    }
    if (!run.launch_encryption_version) return row;
    if (row.content !== run.encrypted_launch_content) {
      throw new Error("Initial agent prompt copy mismatch");
    }
    const plain = await decodeAgentLaunch(run, actorId);
    return { ...row, content: plain.prompt };
  }));
}

function importedMessageContext(projectId: string, messageId: string) {
  if (!projectId || !messageId) throw new Error("Imported agent message scope is required");
  return {
    scope: { kind: "project" as const, id: projectId },
    table: "agent_messages", column: "content", rowId: messageId,
  };
}

export async function encodeImportedAgentMessage(
  projectId: string, messageId: string, content: string,
) {
  const store = getEncryptedStore();
  const encrypted = await store.encrypt(content, importedMessageContext(projectId, messageId));
  return { content: encrypted, content_encryption_version: store.versionOf(encrypted) };
}

/** Imported transcript entries have no source run or event to hydrate. */
export async function hydrateImportedAgentMessages<T extends Record<string, unknown>>(
  client: SupabaseClient, rows: T[], actorId: string | null = null,
  expectedProjectId: string | null = null,
): Promise<T[]> {
  const ids = [...new Set(rows.filter((row) =>
    (row.source === "agent" || ["initial_prompt", "steering", "system", "assistant_summary"]
      .includes(String(row.source))) && row.run_id == null &&
    row.legacy_event_id == null && typeof row.id === "string")
    .map((row) => row.id as string))];
  if (!ids.length) return rows;
  type MessageRow = { id: string; content: string; content_encryption_version?: number;
    conversation: { project_id: string } | null };
  const stored = new Map<string, MessageRow>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const first = await client.from("agent_messages")
      .select("id,content,content_encryption_version,conversation:agent_conversations!inner(project_id)")
      .in("id", batch);
    let data = first.data as unknown as MessageRow[] | null;
    let error = first.error;
    if (legacyAgentLaunchSchema(error)) {
      const legacy = await client.from("agent_messages")
        .select("id,content,conversation:agent_conversations!inner(project_id)")
        .in("id", batch);
      data = legacy.data as unknown as MessageRow[] | null;
      error = legacy.error;
    }
    if (error) throw new Error("Unable to read imported agent messages");
    for (const row of data ?? []) stored.set(row.id, row);
  }
  return Promise.all(rows.map(async (row) => {
    if (typeof row.id !== "string" || !ids.includes(row.id)) return row;
    const message = stored.get(row.id);
    const projectId = message?.conversation?.project_id;
    if (!projectId || expectedProjectId && projectId !== expectedProjectId ||
        message.content !== row.content) {
      throw new Error("Imported agent message is not authorized");
    }
    if (!message.content_encryption_version) return row;
    const binding = importedMessageContext(projectId, row.id);
    const store = getEncryptedStore();
    const encrypted = store.fromDatabase<string>(message.content);
    if (store.versionOf(encrypted) !== message.content_encryption_version) {
      throw new Error("Imported agent message key version mismatch");
    }
    const clear = await store.decrypt(encrypted, binding);
    if (typeof clear !== "string") throw new Error("Invalid imported agent message");
    auditDecryption(binding, { actorId, reason: "repository_read" });
    return { ...row, content: clear };
  }));
}
