import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MAX_PAGE_FILE_BYTES,
  pageFileIdsInBody,
  pageFileStoragePrefix,
  sanitizeFileKey,
} from "@/lib/page-files";
import { resolveUploadedMimeType } from "@/lib/inline-safe";
import { removeStorageObjects } from "@/lib/server/attachments";
import { projectStorageAllowed } from "@/lib/server/storage-quota";

/**
 * One-page files, server side (MIN-280): sending, and HOUSEHOLD.
 *
 * Housekeeping is the half that counts. A connected sending without it is a bucket
 * which swells with images that no document shows anymore, without anything ever saying it. There are therefore three exit doors, and they complement each other:
 *
 * - the SQL CASCADE (`page_files.page_id`) erases the LINES when the page leaves
 * for good — but not the bytes, ever: this is the trap of the subject, and
 * this is why the purge raises the paths BEFORE deleting
 * (lib/server/trash.ts);
 * - the orphan SCAN ({@link sweepOrphanPageFiles}) picks up what has
 * left the body without the page leaving: an image deleted with a stroke of
 * backspace, a cut block and never stuck again ;
 * - and nothing else. In particular, NO comparison on each write of the
 * body: it would delete the file with one undo/redo between two
 * keystrokes, and there is no backtracking on a deleted object.
 */

/** The grace period of an orphan. Seven days, and the number has a reason:
 a file can leave a body and return there by a `⌘Z` done the next day,
 by the restoration of a version of the history (MIN-277), or because the
 page has gone through the trash. What is still there after a week,
, no longer comes back. */
export const ORPHAN_PAGE_FILE_DAYS = 7;

export interface PageFileRow {
  id: string;
  page_id: string;
  project_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_by: string | null;
  created_at: string;
}

export class PageFileError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "PageFileError";
  }
}

/**
 * Uploads the bytes, THEN saves the line — and deletes the object if the line
 * does not pass.
 *
 * This order and not the other: a line without an object would result in an image block that never loads, visible in the document and impossible to repair; an object
 * without a line is just an orphan, and it does not survive the catch-up below.
 * Between the two possible faults, we always choose the one that the household knows
 * to repair.
 */
export async function createPageFile(
  service: SupabaseClient,
  args: {
    projectId: string;
    pageId: string;
    createdBy: string | null;
    fileName: string;
    mimeType: string;
    data: Buffer | Uint8Array;
  }
): Promise<PageFileRow> {
  const size = args.data.byteLength;
  if (size === 0) throw new PageFileError("empty file", 400);
  if (size > MAX_PAGE_FILE_BYTES) throw new PageFileError("file too large", 413);

  // The account quota (MIN-348). This writing goes through the client of
  // SERVICE, which bypasses the policy where the ceiling is placed: without this relay,
  // the page files would be precisely the door that ignores it.
  if (!(await projectStorageAllowed(service, args.projectId))) {
    throw new PageFileError("storage quota exceeded", 507);
  }

  // The type comes from the BYTES and not from the browser announcement (MIN-340):
  // sending a page file goes through the server, so we hold the content
  // — and a `.png` which is actually HTML has no reason to leave
  // labeled `image/png`. The type retained goes into the object header AND into
  // the line, which becomes the trusted source of the read gate.
  const mime = resolveUploadedMimeType(args.mimeType, args.data).slice(0, 120);
  const fileName = args.fileName.trim().slice(0, 200) || "fichier";
  const path = `${pageFileStoragePrefix(args.projectId, args.pageId)}/${crypto.randomUUID()}/${sanitizeFileKey(fileName)}`;

  const { error: uploadError } = await service.storage
    .from("attachments")
    .upload(path, args.data, { contentType: mime });
  if (uploadError) {
    throw new PageFileError(`upload failed: ${uploadError.message}`, 500);
  }

  const { data, error } = await service
    .from("page_files")
    .insert({
      page_id: args.pageId,
      project_id: args.projectId,
      storage_path: path,
      file_name: fileName,
      mime_type: mime,
      size_bytes: size,
      created_by: args.createdBy,
    })
    .select("*")
    .single();

  if (error || !data) {
    await removeStorageObjects(service, [path]);
    throw new PageFileError(`page file insert failed: ${error?.message}`, 500);
  }
  return data as PageFileRow;
}

/** The storage path of a file, if the actor can see it — the reading gate (`GET /api/projects/{id}/pages/files/{fileId}`) only needs that.
 The `project_id` is REQUIRED: without it, a valid file id would serve the
 file of another project which could forge the URL. */
export async function getPageFilePath(
  service: SupabaseClient,
  projectId: string,
  fileId: string
): Promise<{ storage_path: string; file_name: string; mime_type: string } | null> {
  const { data } = await service
    .from("page_files")
    .select("storage_path, file_name, mime_type")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as { storage_path: string; file_name: string; mime_type: string } | null) ?? null;
}

/** The storage paths for the files on these pages. Read BEFORE the delete —
 the cascade takes the lines, never the bytes. */
export async function pageFilePathsForPages(
  service: SupabaseClient,
  pageIds: string[]
): Promise<string[]> {
  if (pageIds.length === 0) return [];
  const { data } = await service
    .from("page_files")
    .select("storage_path")
    .in("page_id", pageIds);
  return (data ?? []).map((row) => (row as { storage_path: string }).storage_path);
}

/** Same, at the scale of a PROJECT: purging a project takes its pages by
 cascade, therefore its page files with it. */
export async function pageFilePathsForProjects(
  service: SupabaseClient,
  projectIds: string[]
): Promise<string[]> {
  if (projectIds.length === 0) return [];
  const { data } = await service
    .from("page_files")
    .select("storage_path")
    .in("project_id", projectIds);
  return (data ?? []).map((row) => (row as { storage_path: string }).storage_path);
}

/**
 * Files that no body is talking about anymore, after the grace period.
 *
 * By SCANNING and not by difference when writing (the why is at the top of this
 * file). The comparison is done page by page: candidates are grouped
 * by `page_id`, the body of each page is read once, and any id that is no longer there
 * goes away — line and object.
 *
 * Reading the body is BLIND to the node type (`pageFileIdsInBody`): it
 * searches for the file address anywhere in the JSON. It's deliberately wide,
 * and the asymmetry is on the good side — the worst case is to keep one file too many,
 * never to delete one that the document still shows.
 *
 * The batch is bounded like the other sweep purges; the next day resumes the
 * continuation. Returns the number of rows actually deleted.
 */
export async function sweepOrphanPageFiles(
  service: SupabaseClient,
  before: string,
  limit = 500
): Promise<number> {
  const { data, error } = await service
    .from("page_files")
    .select("id, page_id, storage_path")
    .lt("created_at", before)
    .limit(limit);
  if (error) throw error;

  const candidates = (data ?? []) as {
    id: string;
    page_id: string;
    storage_path: string;
  }[];
  if (candidates.length === 0) return 0;

  const byPage = new Map<string, typeof candidates>();
  for (const row of candidates) {
    const list = byPage.get(row.page_id) ?? [];
    list.push(row);
    byPage.set(row.page_id, list);
  }

  const { data: pages, error: pagesError } = await service
    .from("pages")
    .select("id, content")
    .in("id", [...byPage.keys()]);
  if (pagesError) throw pagesError;

  const orphans: typeof candidates = [];
  const bodies = new Map(
    ((pages ?? []) as { id: string; content: unknown }[]).map((p) => [p.id, p.content])
  );
  for (const [pageId, rows] of byPage) {
    // A page that has NOT returned from reading no longer exists (it just
    // to be purged between two scans): its files are orphaned
    // straight ahead, their lines having already left via the waterfall.
    const cited = bodies.has(pageId)
      ? pageFileIdsInBody(bodies.get(pageId))
      : new Set<string>();
    for (const row of rows) {
      if (!cited.has(row.id)) orphans.push(row);
    }
  }
  if (orphans.length === 0) return 0;

  const { count, error: deleteError } = await service
    .from("page_files")
    .delete({ count: "exact" })
    .in(
      "id",
      orphans.map((o) => o.id)
    );
  if (deleteError) throw deleteError;

  // The bytes AFTER the line: in the other order, a failed delete would leave
  // a line that names a missing object — therefore a dead block in the document.
  await removeStorageObjects(
    service,
    orphans.map((o) => o.storage_path)
  );
  return count ?? 0;
}
