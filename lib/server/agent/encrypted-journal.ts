import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { getBlindIndexKeys, getEncryptedStore } from "@/lib/server/encryption/registry";
import { blindIndex } from "@/lib/server/encryption/store";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { decodeRunJournalRow, encodeRunJournal, type StoredRunJournalRow } from "./run-journal-codec";

const ENCODING = "encrypted-gzip-json-v1";
type JournalContent = { events: null; payload: string; payload_sha256: string };
type JournalRow = StoredRunJournalRow & {
  id: number | string;
  run_id: string;
  session_id: string;
  encryption_version?: number;
  event_count?: number | null;
  stored_bytes?: number | null;
};

export async function journalProject(runId: string): Promise<string> {
  const { data, error } = await getServiceClient().from("agent_runs")
    .select("project_id").eq("id", runId).single();
  if (error || typeof data?.project_id !== "string") {
    throw new Error("Unable to resolve agent journal project");
  }
  return data.project_id;
}

function context(projectId: string, row: Pick<JournalRow, "run_id" | "session_id" | "payload_sha256">) {
  if (!row.payload_sha256) throw new Error("Missing agent journal lookup");
  return {
    scope: { kind: "project" as const, id: projectId },
    table: "agent_run_journal",
    column: "payload",
    rowId: JSON.stringify([row.run_id, row.session_id, row.payload_sha256]),
  };
}

export async function journalLookup(projectId: string, digest: string): Promise<string> {
  const scope = { kind: "project" as const, id: projectId };
  const key = await getBlindIndexKeys().current(scope);
  try {
    return blindIndex(digest, { scope, table: "agent_run_journal", column: "payload_sha256" }, key.bytes);
  } finally {
    key.bytes.fill(0);
  }
}

export async function shouldEncryptJournal(projectId: string): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_JOURNAL_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await getServiceClient().from("agent_journal_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent journal encryption state");
  }
  return !!data;
}

export async function encryptJournal(
  projectId: string,
  row: JournalRow,
  legacyJson = false,
): Promise<JournalRow> {
  if (!row.payload_sha256 || typeof row.payload !== "string") {
    throw new Error("Incomplete agent journal payload");
  }
  const digest = await journalLookup(projectId,
    legacyJson ? `${row.payload_sha256}:${row.id}` : row.payload_sha256);
  const stored = { ...row, payload_sha256: digest };
  const payload = await getEncryptedStore().encrypt<JournalContent>({
    events: null, payload: row.payload, payload_sha256: row.payload_sha256,
  }, context(projectId, stored));
  return {
    ...stored, events: null, payload, payload_encoding: ENCODING,
    encryption_version: getEncryptedStore().versionOf(payload),
  };
}

export async function decodeJournal(
  projectId: string,
  row: JournalRow,
): Promise<ReturnType<typeof decodeRunJournalRow>> {
  if (!row.encryption_version) return decodeRunJournalRow(row);
  if (row.payload_encoding !== ENCODING || row.events !== null ||
      typeof row.payload !== "string") throw new Error("Invalid encrypted agent journal row");
  const store = getEncryptedStore();
  const value = store.fromDatabase<JournalContent>(row.payload);
  if (store.versionOf(value) !== row.encryption_version) {
    throw new Error("Agent journal key version mismatch");
  }
  const clear = await store.decrypt(value, context(projectId, row));
  if (clear.events !== null || typeof clear.payload !== "string" ||
      typeof clear.payload_sha256 !== "string" ||
      await journalLookup(projectId, clear.payload_sha256) !== row.payload_sha256 &&
      await journalLookup(projectId, `${clear.payload_sha256}:${row.id}`) !== row.payload_sha256) {
    throw new Error("Invalid encrypted agent journal content");
  }
  const decoded = decodeRunJournalRow({
    ...row, payload: clear.payload, payload_encoding: "gzip-json-v1",
    payload_sha256: clear.payload_sha256,
  });
  if (row.event_count !== null && row.event_count !== undefined &&
      decoded.events.length !== row.event_count) {
    throw new Error("Agent journal event count mismatch");
  }
  auditDecryption(context(projectId, row), { actorId: null, reason: "repository_read" });
  return decoded;
}

export function journalEncodedRow(runId: string, sessionId: string, events: Record<string, unknown>[]) {
  const encoded = encodeRunJournal(events);
  return {
    run_id: runId, session_id: sessionId, events: null,
    payload: encoded.payload, payload_encoding: encoded.encoding,
    payload_sha256: encoded.sha256, event_count: encoded.eventCount,
    payload_bytes: encoded.payloadBytes, stored_bytes: encoded.storedBytes,
  };
}
