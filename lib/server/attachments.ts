import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getProjectAccess } from "@/lib/server/project-access";
import type { Attachment, AttachmentInput } from "@/lib/types";

/** Client-checked too (use-attachment-uploads) — keep the two in sync. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_ATTACHMENTS_PER_ENTITY = 10;

/**
 * Validate the attachment descriptors a client sends after its direct-to-storage
 * uploads. `requiredPrefix` pins the path family the caller is allowed to
 * reference (`projects/{pid}/` or `chat/{uid}/`) so nobody can register a row
 * pointing at someone else's file. Returns null when the payload is malformed
 * (callers answer 400); absent/empty input yields [].
 */
export function parseAttachmentsInput(
  raw: unknown,
  requiredPrefix: string,
  max = MAX_ATTACHMENTS_PER_ENTITY
): AttachmentInput[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > max) return null;

  const out: AttachmentInput[] = [];
  for (const item of raw) {
    const a = item as Partial<AttachmentInput> | null;
    if (
      !a ||
      typeof a.storage_path !== "string" ||
      typeof a.file_name !== "string" ||
      typeof a.mime_type !== "string" ||
      typeof a.size_bytes !== "number"
    ) {
      return null;
    }
    const path = a.storage_path.trim();
    if (
      !path.startsWith(requiredPrefix) ||
      path.includes("..") ||
      path.length > 400
    ) {
      return null;
    }
    const fileName = a.file_name.trim().slice(0, 200);
    if (!fileName) return null;
    if (
      !Number.isFinite(a.size_bytes) ||
      a.size_bytes < 0 ||
      a.size_bytes > MAX_ATTACHMENT_BYTES
    ) {
      return null;
    }
    out.push({
      storage_path: path,
      file_name: fileName,
      mime_type: a.mime_type.slice(0, 120) || "application/octet-stream",
      size_bytes: Math.round(a.size_bytes),
    });
  }
  return out;
}

/** Storage keys reject most exotic characters — mirror of the client-side
    sanitizer in lib/use-attachment-uploads.ts. */
function sanitizeKeyPart(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (sanitized || "fichier").slice(-140);
}

/**
 * Server-side upload + row registration in one step — for callers that carry
 * the file content themselves (MCP agents send it inline as base64; they have
 * no browser to do the direct-to-storage upload). Callers have checked
 * project access. Throws on failure; a failed row insert cleans up the
 * just-uploaded object.
 */
export async function uploadAttachment(
  service: SupabaseClient,
  args: {
    projectId: string;
    issueId: string;
    commentId?: string | null;
    createdBy: string | null;
    fileName: string;
    mimeType?: string;
    data: Buffer;
  }
): Promise<Attachment> {
  const mime = args.mimeType?.trim().slice(0, 120) || "application/octet-stream";
  const path = `projects/${args.projectId}/${crypto.randomUUID()}/${sanitizeKeyPart(
    args.fileName
  )}`;

  const { error } = await service.storage
    .from("attachments")
    .upload(path, args.data, { contentType: mime });
  if (error) throw new Error(`attachment upload failed: ${error.message}`);

  try {
    const [row] = await insertAttachments(service, {
      projectId: args.projectId,
      issueId: args.issueId,
      commentId: args.commentId ?? null,
      createdBy: args.createdBy,
      attachments: [
        {
          storage_path: path,
          file_name: args.fileName.trim().slice(0, 200) || "fichier",
          mime_type: mime,
          size_bytes: args.data.byteLength,
        },
      ],
    });
    return row;
  } catch (e) {
    await removeStorageObjects(service, [path]);
    throw e;
  }
}

/** `projects/{uuid}/…` — extracts the project a storage key belongs to. */
const PROJECT_PATH_RE = /^projects\/([0-9a-fA-F-]{36})\//;

/**
 * Copy files uploaded under their SOURCE project's prefix into `targetProjectId`,
 * returning descriptors (with the new target paths) ready for insertAttachments.
 * Cross-project issue creation needs this: the browser uploaded the files under
 * the source project, and a storage object can't be referenced across projects.
 *
 * Each source project is access-checked against the actor (cached) so a client
 * can't smuggle another project's file into one it owns; files whose source is
 * unreadable or whose copy fails are skipped (best-effort, like all attachment
 * handling). A null actor (integration) can't be access-checked, so nothing is
 * copied.
 */
export async function copyAttachmentsToProject(
  service: SupabaseClient,
  args: {
    targetProjectId: string;
    actorId: string | null;
    attachments: AttachmentInput[];
  }
): Promise<AttachmentInput[]> {
  if (args.attachments.length === 0 || !args.actorId) return [];
  const access = new Map<string, boolean>();
  const out: AttachmentInput[] = [];

  for (const a of args.attachments) {
    const sourcePid = PROJECT_PATH_RE.exec(a.storage_path)?.[1];
    if (!sourcePid) continue;
    // Already in the target project — register as-is, no copy needed.
    if (sourcePid === args.targetProjectId) {
      out.push(a);
      continue;
    }
    let canReach = access.get(sourcePid);
    if (canReach === undefined) {
      canReach = !!(await getProjectAccess(args.actorId, sourcePid));
      access.set(sourcePid, canReach);
    }
    if (!canReach) continue;

    const targetPath = `projects/${args.targetProjectId}/${crypto.randomUUID()}/${sanitizeKeyPart(
      a.file_name
    )}`;
    const { error } = await service.storage
      .from("attachments")
      .copy(a.storage_path, targetPath);
    if (error) {
      console.error("[attachments] cross-project copy failed:", error.message);
      continue;
    }
    out.push({ ...a, storage_path: targetPath });
  }
  return out;
}

/** Insert the rows for files already uploaded to storage (service client —
    callers have checked project access). The parent is an issue OR an objective
    OR a feedback post (exactly one — the attachments_parent_ck constraint). */
export async function insertAttachments(
  service: SupabaseClient,
  args: {
    projectId: string;
    issueId?: string | null;
    objectiveId?: string | null;
    feedbackPostId?: string | null;
    commentId?: string | null;
    createdBy: string | null;
    attachments: AttachmentInput[];
  }
): Promise<Attachment[]> {
  if (args.attachments.length === 0) return [];
  const { data, error } = await service
    .from("attachments")
    .insert(
      args.attachments.map((a) => ({
        project_id: args.projectId,
        issue_id: args.issueId ?? null,
        objective_id: args.objectiveId ?? null,
        feedback_post_id: args.feedbackPostId ?? null,
        comment_id: args.commentId ?? null,
        created_by: args.createdBy,
        ...a,
      }))
    )
    .select("*");
  if (error) throw new Error(`attachments insert failed: ${error.message}`);
  return (data ?? []) as Attachment[];
}

/** Short-lived signed URL on the private bucket (service role bypasses the
    absence of a storage select policy). Null when the object is missing. */
export async function signedAttachmentUrl(
  service: SupabaseClient,
  storagePath: string,
  { download = false, expiresIn = 600 }: { download?: string | boolean; expiresIn?: number } = {}
): Promise<string | null> {
  const { data, error } = await service.storage
    .from("attachments")
    .createSignedUrl(storagePath, expiresIn, download ? { download } : undefined);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Fetch an attachment's bytes from the private bucket (service role bypasses
    the absence of a storage select policy). Null when the object is missing. */
export async function downloadAttachment(
  service: SupabaseClient,
  storagePath: string
): Promise<Buffer | null> {
  const { data, error } = await service.storage
    .from("attachments")
    .download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** Best-effort storage cleanup — a failure must never fail the business write
    (the leftover is an orphan object, same class as an abandoned upload). */
export async function removeStorageObjects(
  service: SupabaseClient,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { error } = await service.storage.from("attachments").remove(paths);
    if (error) {
      console.error("[attachments] storage cleanup failed:", error.message);
    }
  } catch (e) {
    console.error("[attachments] storage cleanup failed:", (e as Error).message);
  }
}
