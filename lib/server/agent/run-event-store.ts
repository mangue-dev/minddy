import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

export type StoredRunEvent = {
  id: string;
  seq: number;
  type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type EventRow = StoredRunEvent & {
  run_id: string;
  encryption_version: number;
  encrypted_content: string | null;
};

const EVENT_COLUMNS = "id,run_id,seq,type,payload,encrypted_content,encryption_version,created_at,run:agent_runs!inner(project_id)";
const LEGACY_COLUMNS = "id,run_id,seq,type,payload,created_at,run:agent_runs!inner(project_id)";

function legacySchema(error: { code?: string } | null) {
  return process.env.MINDDY_AGENT_EVENT_ENCRYPTION_ENABLED !== "true" &&
    (error?.code === "42703" || error?.code === "PGRST204");
}

function eventContext(projectId: string, runId: string, eventId: string) {
  if (!projectId || !runId || !eventId) throw new Error("Run event project scope is required");
  return {
    scope: { kind: "project" as const, id: projectId },
    table: "agent_run_events", column: "payload", rowId: JSON.stringify([runId, eventId]),
  };
}

export async function shouldEncryptRunEvent(service: SupabaseClient, projectId: string) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_EVENT_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_event_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent event encryption state");
  }
  return !!data;
}

export async function encodeRunEvent(
  projectId: string, runId: string, seq: number, type: string,
  payload: Record<string, unknown> | null, id: string = randomUUID(),
) {
  const store = getEncryptedStore();
  const encrypted = await store.encrypt(payload, eventContext(projectId, runId, id));
  const questionId = type === "question" || type === "needs_input"
    ? payload?.question_id ?? payload?.id : null;
  const callId = type === "question" || type === "needs_input"
    ? payload?.call_id ?? payload?.id ?? questionId : null;
  return {
    id, run_id: runId, seq, type, payload: null,
    encrypted_content: encrypted, encryption_version: store.versionOf(encrypted),
    has_summary_text: type === "summary" && typeof payload?.text === "string" &&
      payload.text.trim().length > 0,
    question_id: typeof questionId === "string" && questionId ? questionId : null,
    call_id: typeof callId === "string" && callId ? callId : null,
    has_questions: Array.isArray(payload?.questions) && payload.questions.length > 0,
  };
}

export async function decodeRunEvent(
  projectId: string, row: EventRow, actorId: string | null = null,
): Promise<StoredRunEvent> {
  let payload = row.payload;
  const version = row.encryption_version ?? 0;
  if (version > 0) {
    if (row.payload !== null || typeof row.encrypted_content !== "string") {
      throw new Error("Invalid encrypted run event");
    }
    const context = eventContext(projectId, row.run_id, row.id);
    const store = getEncryptedStore();
    const value = store.fromDatabase<Record<string, unknown>>(row.encrypted_content);
    if (store.versionOf(value) !== version) {
      throw new Error("Run event key version mismatch");
    }
    payload = await store.decrypt(value, context);
    if (payload !== null && (typeof payload !== "object" || Array.isArray(payload))) {
      throw new Error("Invalid run event payload");
    }
    auditDecryption(context, { actorId, reason: "repository_read" });
  } else if (version !== 0 || row.encrypted_content != null) {
    throw new Error("Invalid legacy run event");
  }
  return { id: row.id, seq: row.seq, type: row.type,
    payload, created_at: row.created_at };
}

/** Read only events belonging to the supplied, already authorized run. */
export async function listRunEvents(
  service: SupabaseClient,
  run: { id: string; project_id: string },
  options: { after?: number; types?: string[]; actorId?: string | null } = {},
): Promise<StoredRunEvent[]> {
  if (!run.id || !run.project_id) throw new Error("Run event project scope is required");
  const read = (columns: string) => {
    let query = service.from("agent_run_events")
    .select(columns)
    .eq("run_id", run.id)
    .eq("run.project_id", run.project_id)
    .order("seq", { ascending: true });
    if (options.after !== undefined) query = query.gt("seq", options.after);
    if (options.types) query = query.in("type", options.types);
    return query;
  };
  let { data, error } = await read(EVENT_COLUMNS);
  if (legacySchema(error)) ({ data, error } = await read(LEGACY_COLUMNS));
  if (error) throw new Error("Unable to read agent run events");
  return Promise.all((data ?? []).map((row) =>
    decodeRunEvent(run.project_id, row as unknown as EventRow, options.actorId)));
}

/** Decode copies after authorization. A null project requires the caller's RLS client. */
export async function hydrateAgentSummaryCopies<T extends Record<string, unknown>>(
  service: SupabaseClient, projectId: string | null, rows: T[],
  actorId: string | null = null,
): Promise<T[]> {
  const ids = [...new Set(rows.filter((row) => row.source === "agent" ||
    row.source === "assistant_summary").map((row) => row.legacy_event_id)
    .filter((id): id is string => typeof id === "string"))];
  if (!ids.length) return rows;
  const decoded = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const read = (columns: string) => {
      const query = service.from("agent_run_events").select(columns).in("id", batch);
      return projectId ? query.eq("run.project_id", projectId) : query;
    };
    let { data, error } = await read(EVENT_COLUMNS);
    if (legacySchema(error)) ({ data, error } = await read(LEGACY_COLUMNS));
    if (error) throw new Error("Unable to read agent summary events");
    for (const raw of data ?? []) {
      const row = raw as unknown as EventRow & { run?: { project_id: string } };
      const sourceProjectId = row.run?.project_id;
      if (!sourceProjectId || projectId && sourceProjectId !== projectId) {
        throw new Error("Agent summary project scope mismatch");
      }
      const event = await decodeRunEvent(sourceProjectId, row, actorId);
      if (event.type !== "summary" || typeof event.payload?.text !== "string") {
        throw new Error("Invalid agent summary event");
      }
      decoded.set(event.id, event.payload.text);
    }
  }
  if (decoded.size !== ids.length) throw new Error("Missing agent summary event");
  return rows.map((row) => typeof row.legacy_event_id === "string"
    && decoded.has(row.legacy_event_id)
    ? { ...row, content: decoded.get(row.legacy_event_id) } : row);
}
