import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";
import { getEncryptedStore } from "./encryption/registry";
import { shouldProtectProjects } from "./project-content";

/**
 * The codec of Numo's notes (MIN-914). Title and body are model-written free
 * text, sealed under the project's key once project content encryption is
 * active. Kept apart from `numo-notes.ts` so the inbox and push readers do not
 * import the writer, which imports the notification insert path.
 */

export interface NumoNoteContent {
  title: string;
  body: string;
}

type Row = Record<string, unknown>;

function validContent(row: Row): boolean {
  return typeof row.title === "string" && !!row.title.trim() &&
    typeof row.body === "string" && !!row.body.trim();
}

function scope(row: Row) {
  if (typeof row.project_id !== "string" || !row.project_id) {
    throw new Error("Numo note project is required");
  }
  return { kind: "project" as const, id: row.project_id };
}

/** Seal a complete note before its insert when project content is protected. */
export async function encodeNumoNote(row: Row,
  options: { service?: SupabaseClient; force?: boolean } = {}): Promise<Row> {
  if (!validContent(row) || typeof row.id !== "string" || !row.id) {
    throw new Error("Incomplete Numo note");
  }
  const protect = options.force || await shouldProtectProjects(options.service);
  if (!protect) return { ...row, encryption_version: 0, encrypted_content: null };
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, encryption_version: 0, encrypted_content: null,
  } as StoredRow, { table: "numo_notes", scope: scope(row) });
}

/** The caller must have checked that `actorId` is the note's recipient. */
export async function decodeNumoNote(row: Row, actorId: string | null = null):
  Promise<NumoNoteContent> {
  if (row.encryption_version === 0 || row.encryption_version === undefined) {
    if (row.encrypted_content != null || !validContent(row)) {
      throw new Error("Invalid legacy Numo note");
    }
    return { title: row.title as string, body: row.body as string };
  }
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
    row as StoredRow, { table: "numo_notes", scope: scope(row) },
    { actorId, reason: "repository_read" });
  if (!validContent(decoded)) throw new Error("Invalid protected Numo note");
  return { title: decoded.title as string, body: decoded.body as string };
}

const NOTE_COLUMNS =
  "id, project_id, user_id, title, body, encrypted_content, encryption_version";

/**
 * Read notes by id. With `recipientId`, only that user's notes come back: the
 * inbox reads its own. A note that fails to decode is left out, so the row
 * falls back to the generic sentence instead of breaking the inbox.
 */
export async function readNumoNotes(
  service: SupabaseClient,
  ids: readonly string[],
  recipientId: string | null,
): Promise<Map<string, NumoNoteContent> | null> {
  const unique = [...new Set(ids.filter(Boolean))];
  const notes = new Map<string, NumoNoteContent>();
  if (unique.length === 0) return notes;
  let query = service.from("numo_notes").select(NOTE_COLUMNS).in("id", unique);
  if (recipientId) query = query.eq("user_id", recipientId);
  const { data, error } = await query;
  if (error) return null;
  for (const row of (data ?? []) as Row[]) {
    try {
      notes.set(row.id as string, await decodeNumoNote(row,
        recipientId ?? (row.user_id as string)));
    } catch {
      console.error("[numo-notes] decode_failed");
    }
  }
  return notes;
}
