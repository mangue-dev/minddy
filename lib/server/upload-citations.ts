import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeComment } from "@/lib/server/comment-store";
import { decodeFeedbackPost } from "@/lib/server/feedback-post-store";
import { decodeIssue } from "@/lib/server/issue-store";
import { decodeObjective } from "@/lib/server/objective-store";
import { decodePageProjection } from "@/lib/server/page-content";
import { decodeRoutine } from "@/lib/server/routine-content";
import { decodeHistoryRow } from "@/lib/server/encryption/history-content";
import { decodeScratchpadRow } from "@/lib/server/encryption/scratchpad-content";
import { decodeNumoUserMessage } from "@/lib/server/numo/user-message-content";

/**
 * Which uploads a document still cites (MIN-792).
 *
 * A row is not the only reference to an uploaded object. Every editor writes
 * an image into its text by address (MIN-728): `/api/attachments/file?path=…`
 * in a description, a plan, an objective or the notebook, and
 * `/api/projects/<id>/pages/files/<id>` in a page. That address travels with
 * the text: pasted into another ticket, kept in a page version, copied from
 * the notebook into tickets by Numo, carried along when a ticket moves to
 * another project. Deleting the object behind it breaks every one of those
 * copies, and nothing brings it back.
 *
 * So before the nightly sweep deletes anything, this module reads every text
 * that can carry such an address — through each table's own decoder, since
 * most of them are encrypted — and reports which candidates still appear.
 *
 * The match is deliberately wide: a candidate is cited when its id, a random
 * UUID, appears ANYWHERE in a decoded row, whatever the node, the encoding of
 * the URL or the field. The worst case is keeping an object one week longer;
 * the other mistake would delete someone's image. For the same reason any
 * read or decode failure throws, and the caller deletes nothing that night.
 */

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const UUID_ONLY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rows read per request, and rows decoded at once. */
const PAGE_SIZE = 500;
const DECODE_CONCURRENCY = 25;

/**
 * The id a document cites an attachment object by: the opaque UUID that ends
 * its storage path (`projects/<p>/<uuid>`, `chat/<u>/<uuid>`). Null for a
 * name that does not end with one; such an object cannot be matched, so the
 * caller keeps it.
 */
export function uploadObjectId(storagePath: string): string | null {
  const last = storagePath.split("/").at(-1) ?? "";
  return UUID_ONLY.test(last) ? last.toLowerCase() : null;
}

/** Adds to `found` every id of `wanted` that appears in any string of `value`. */
export function collectCitedIds(
  value: unknown,
  wanted: ReadonlySet<string>,
  found: Set<string>
): void {
  const visit = (node: unknown, depth: number) => {
    if (node === null || node === undefined || depth > 64) return;
    if (typeof node === "string") {
      for (const match of node.matchAll(UUID_PATTERN)) {
        const id = match[0].toLowerCase();
        if (wanted.has(id)) found.add(id);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node === "object") {
      for (const item of Object.values(node)) visit(item, depth + 1);
    }
  };
  visit(value, 0);
}

type Row = Record<string, unknown>;

/** A table whose text can cite an upload, and the decoder that opens it. */
interface CitingSource {
  table: string;
  /** Ordering key for pagination; unique per row. */
  key: string;
  decode: (row: Row) => Promise<unknown>;
}

/**
 * Every text that can carry an upload address. Trashed rows are read like the
 * others: a restored ticket must find its images again.
 *
 * Not listed, on purpose: activity events (a description or plan change is
 * recorded without its text), Numo assistant replies (they display an image,
 * they are not its source), and the live collaboration journals, which the
 * page-materialization cron writes into these rows within a minute.
 */
const SOURCES: CitingSource[] = [
  { table: "issues", key: "id", decode: (row) => decodeIssue(row) },
  { table: "objectives", key: "id", decode: (row) => decodeObjective(row) },
  { table: "comments", key: "id", decode: (row) => decodeComment("comments", row) },
  { table: "page_comments", key: "id", decode: (row) => decodeComment("page_comments", row) },
  { table: "pages", key: "id", decode: (row) => decodePageProjection(row) },
  { table: "page_versions", key: "id", decode: (row) => decodeHistoryRow("page_versions", row, null) },
  { table: "feedback_posts", key: "id", decode: (row) => decodeFeedbackPost(row) },
  { table: "agent_routines", key: "id", decode: (row) => decodeRoutine(row) },
  {
    table: "user_scratchpad",
    key: "user_id",
    decode: (row) => decodeScratchpadRow(row, row.user_id as string),
  },
];

async function decodeAll(rows: Row[], decode: (row: Row) => Promise<unknown>,
  wanted: ReadonlySet<string>, found: Set<string>) {
  for (let i = 0; i < rows.length; i += DECODE_CONCURRENCY) {
    const decoded = await Promise.all(rows.slice(i, i + DECODE_CONCURRENCY).map(decode));
    for (const row of decoded) collectCitedIds(row, wanted, found);
  }
}

async function scanSource(service: SupabaseClient, source: CitingSource,
  wanted: ReadonlySet<string>, found: Set<string>) {
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await service
      .from(source.table)
      .select("*")
      .order(source.key)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`citation scan failed (${source.table}): ${error.message}`);
    const rows = (data ?? []) as Row[];
    await decodeAll(rows, source.decode, wanted, found);
    if (rows.length < PAGE_SIZE || found.size === wanted.size) return;
  }
}

/**
 * The Numo messages of the owners of `chat/` candidates. A chat upload can
 * only be attached by its owner (`chat/<uid>/` is checked on upload and on
 * send), so other accounts' conversations cannot be its source. A deleted
 * conversation takes its messages with it, and its files become orphans.
 */
async function scanNumoMessages(service: SupabaseClient, owners: readonly string[],
  wanted: ReadonlySet<string>, found: Set<string>) {
  for (const owner of owners) {
    const conversations: string[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await service.from("conversations").select("id")
        .eq("user_id", owner).order("id").range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(`citation scan failed (conversations): ${error.message}`);
      conversations.push(...(data ?? []).map((row) => row.id as string));
      if ((data?.length ?? 0) < PAGE_SIZE) break;
    }
    for (let i = 0; i < conversations.length; i += 100) {
      const ids = conversations.slice(i, i + 100);
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await service.from("assistant_messages")
          .select("id,content,context,metadata,tool_calls,tool_call_id,tool_name,user_payload_version")
          .in("conversation_id", ids).eq("role", "user")
          .order("id").range(offset, offset + PAGE_SIZE - 1);
        if (error) throw new Error(`citation scan failed (assistant_messages): ${error.message}`);
        const rows = (data ?? []) as Row[];
        await decodeAll(rows, (row) => decodeNumoUserMessage(owner,
          row as Parameters<typeof decodeNumoUserMessage>[1], owner), wanted, found);
        if (rows.length < PAGE_SIZE) break;
      }
    }
  }
}

/**
 * The ids of `ids` that some document still cites. `chatOwners` are the
 * accounts whose `chat/` uploads are among the candidates; their Numo
 * messages are read too. Throws when any source cannot be read.
 */
export async function findCitedUploads(
  service: SupabaseClient,
  ids: Iterable<string>,
  chatOwners: Iterable<string> = []
): Promise<Set<string>> {
  const wanted = new Set([...ids].map((id) => id.toLowerCase()));
  const found = new Set<string>();
  if (wanted.size === 0) return found;
  for (const source of SOURCES) {
    await scanSource(service, source, wanted, found);
    if (found.size === wanted.size) return found;
  }
  await scanNumoMessages(service, [...new Set(chatOwners)], wanted, found);
  return found;
}

/**
 * Record the paths found cited, so the candidate queries skip them until the
 * grace period has passed again (`upload_citation_checks`). Without it the
 * same cited objects would fill every night's batch. Best effort: a failure
 * only means they are read again tomorrow.
 */
export async function recordCitedUploads(
  service: SupabaseClient,
  storagePaths: readonly string[],
  now: Date = new Date()
): Promise<void> {
  const paths = [...new Set(storagePaths)].filter((p) => /^(projects|chat)\//.test(p));
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await service.from("upload_citation_checks").upsert(
      paths.slice(i, i + 100).map((storage_path) => ({
        storage_path, checked_at: now.toISOString(),
      })),
      { onConflict: "storage_path" }
    );
    if (error) {
      console.error("[upload-citations] check record failed:", error.message);
      return;
    }
  }
}

/** Checks older than the grace period no longer skip anything: drop them. */
export async function pruneUploadCitationChecks(
  service: SupabaseClient,
  before: string
): Promise<number> {
  const { count, error } = await service.from("upload_citation_checks")
    .delete({ count: "exact" }).lt("checked_at", before);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
