import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { getEncryptedStore, SupabaseKeyRegistry } from "./encryption/registry";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";

type Row = Record<string, unknown>;
type Draft = { id: string; name: string; step: string; data: Record<string, unknown>; updated_at: string };

function validate(row: Row): void {
  if (typeof row.id !== "string" || typeof row.user_id !== "string" ||
      typeof row.name !== "string" || !row.name.trim() ||
      typeof row.step !== "string" || !row.step ||
      !row.data || typeof row.data !== "object" || Array.isArray(row.data)) {
    throw new Error("Invalid project draft content");
  }
}

/** Decode only rows selected through the owner's RLS client or checked by the guarded write. */
export async function decodeProjectDraft(row: Row, actorId: string): Promise<Draft> {
  if (row.user_id !== actorId) throw new Error("Project draft owner mismatch");
  const { encryption_version, encrypted_content, encryption_revision: _revision,
    encryption_checked_at: _checked, ...plain } = row;
  let decoded: Row;
  if (encryption_version === undefined && encrypted_content === undefined ||
      encryption_version === 0 && encrypted_content === null) {
    decoded = plain;
  } else {
    decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(row as StoredRow,
      { table: "project_drafts", scope: { kind: "user", id: actorId } },
      { actorId, reason: "repository_read" });
  }
  validate(decoded);
  return {
    id: decoded.id as string, name: decoded.name as string, step: decoded.step as string,
    data: decoded.data as Record<string, unknown>, updated_at: decoded.updated_at as string,
  };
}

async function encodeProjectDraft(row: Row, previousVersion: number): Promise<Row> {
  validate(row);
  const scope = { kind: "user" as const, id: row.user_id as string };
  if (!isContentEncryptionEnabled() && previousVersion === 0) {
    try {
      if (!await new SupabaseKeyRegistry("content").loadCurrent(scope)) {
        return { ...row, encryption_version: 0, encrypted_content: null };
      }
    } catch (error) {
      if (error instanceof Error && /^Unable to load current data key: (42P01|PGRST205)$/.test(error.message)) {
        return row;
      }
      throw error;
    }
  }
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, encryption_version: 0, encrypted_content: null,
  }, { table: "project_drafts", scope });
}

/** Keep owner filtering in SQL and decrypt the complete row before API projection. */
export async function listProjectDrafts(client: SupabaseClient, actorId: string): Promise<Draft[]> {
  const { data, error } = await client.from("project_drafts").select("*")
    .eq("user_id", actorId).order("updated_at", { ascending: false });
  if (error) throw new Error("Unable to list project drafts");
  return Promise.all((data ?? []).map((row) => decodeProjectDraft(row as Row, actorId)));
}

/** Save a complete draft with owner and revision checked atomically in PostgreSQL. */
export async function saveProjectDraft(client: SupabaseClient, actorId: string, input: {
  id: string; name: string; step: string; data: Record<string, unknown>;
}): Promise<Draft> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: previous, error } = await client.from("project_drafts").select("*")
      .eq("id", input.id).eq("user_id", actorId).maybeSingle();
    if (error) throw new Error("Unable to read project draft");
    const version = (previous?.encryption_version as number | undefined) ?? 0;
    const encoded = await encodeProjectDraft({ ...input, user_id: actorId }, version);
    if (previous && previous.encryption_version === undefined) {
      if (isContentEncryptionEnabled() || encoded.encryption_version !== undefined) {
        throw new Error("Project draft encryption schema is unavailable");
      }
      const { data, error: writeError } = await client.from("project_drafts")
        .upsert({ ...input, user_id: actorId }, { onConflict: "id" })
        .select("*").single();
      if (writeError || !data) throw new Error("Unable to save project draft");
      return decodeProjectDraft(data as Row, actorId);
    }
    const { data: written, error: writeError } = await getServiceClient().rpc("save_project_draft_guarded", {
      p_id: input.id, p_actor_id: actorId, p_name: encoded.name, p_step: input.step,
      p_data: encoded.data, p_encryption_version: encoded.encryption_version ?? 0,
      p_encrypted_content: encoded.encrypted_content ?? null,
      p_expected_revision: previous?.encryption_revision ?? null,
    });
    if (!previous && !isContentEncryptionEnabled() && encoded.encryption_version === undefined &&
        (writeError?.code === "PGRST202" || writeError?.code === "42883")) {
      const { data, error: legacyError } = await client.from("project_drafts")
        .upsert({ ...input, user_id: actorId }, { onConflict: "id" })
        .select("*").single();
      if (legacyError || !data) throw new Error("Unable to save project draft");
      return decodeProjectDraft(data as Row, actorId);
    }
    if (writeError?.code === "40001" || writeError?.code === "23505") continue;
    if (writeError || !written) throw new Error("Unable to save project draft");
    return decodeProjectDraft(written as Row, actorId);
  }
  throw new Error("Unable to save project draft after concurrent edits");
}
