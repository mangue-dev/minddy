import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getProjectAccess } from "@/lib/server/project-access";
import type {
  Attachment,
  LinkResourceInput,
  ResourceInput,
} from "@/lib/types";
import { isLinkResource } from "@/lib/types";

/** Client-checked too (use-attachment-uploads) — keep the two in sync. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB
/** Files and links confounded — a resource is a resource (MIN-184). */
export const MAX_ATTACHMENTS_PER_ENTITY = 10;
export const MAX_LINK_URL_LENGTH = 2000;
/** A favicon reduced to 32 px WebP weighs ~1-2 Ko; past this it isn't one. */
export const MAX_ICON_DATA_URL_BYTES = 24 * 1024;

/** `data:image/png;base64,…` — the only shape a favicon may take in a row. */
const ICON_DATA_URL_RE = /^data:image\/(png|jpeg|webp|x-icon|vnd\.microsoft\.icon|gif);base64,[A-Za-z0-9+/=]+$/;

/** The link half of {@link parseResourcesInput}. Null on anything malformed. */
function parseLinkResource(a: Record<string, unknown>): LinkResourceInput | null {
  if (typeof a.url !== "string" || typeof a.file_name !== "string") return null;
  const raw = a.url.trim();
  if (!raw || raw.length > MAX_LINK_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // http(s) only: `javascript:`, `data:` and friends have no business here.
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const fileName = a.file_name.trim().slice(0, 200);
  if (!fileName) return null;

  let icon: string | null = null;
  if (a.icon_data_url != null) {
    if (typeof a.icon_data_url !== "string") return null;
    const candidate = a.icon_data_url.trim();
    if (
      !ICON_DATA_URL_RE.test(candidate) ||
      candidate.length > MAX_ICON_DATA_URL_BYTES
    ) {
      return null;
    }
    icon = candidate;
  }

  return { kind: "link", url: raw, file_name: fileName, icon_data_url: icon };
}

/**
 * Validate the resource descriptors a client sends — a FILE (after its
 * direct-to-storage upload) or a LINK (after /link-preview resolved its title
 * and favicon). `requiredPrefix` pins the path family a file is allowed to
 * reference (`projects/{pid}/` or `chat/{uid}/`) so nobody can register a row
 * pointing at someone else's file. Returns null when the payload is malformed
 * (callers answer 400); absent/empty input yields [].
 */
export function parseResourcesInput(
  raw: unknown,
  requiredPrefix: string,
  max = MAX_ATTACHMENTS_PER_ENTITY
): ResourceInput[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > max) return null;

  const out: ResourceInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const a = item as Record<string, unknown>;
    const kind = a.kind ?? "file";
    if (kind !== "file" && kind !== "link") return null;

    if (kind === "link") {
      const link = parseLinkResource(a);
      if (!link) return null;
      out.push(link);
      continue;
    }

    if (
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
      resources: [
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
 * A LINK has no storage object to copy — it goes through untouched.
 *
 * Each source project is access-checked against the actor (cached) so a client
 * can't smuggle another project's file into one it owns; files whose source is
 * unreadable or whose copy fails are skipped (best-effort, like all resource
 * handling). A null actor (integration) can't be access-checked, so nothing is
 * copied.
 */
export async function copyResourcesToProject(
  service: SupabaseClient,
  args: {
    targetProjectId: string;
    actorId: string | null;
    resources: ResourceInput[];
  }
): Promise<ResourceInput[]> {
  if (args.resources.length === 0 || !args.actorId) return [];
  const access = new Map<string, boolean>();
  const out: ResourceInput[] = [];

  for (const a of args.resources) {
    if (isLinkResource(a)) {
      out.push(a);
      continue;
    }
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

/** The parent columns of an attachment row — exactly one of the four ids is
    set (the attachments_parent_ck constraint). */
interface AttachmentParent {
  projectId: string;
  issueId?: string | null;
  objectiveId?: string | null;
  feedbackPostId?: string | null;
  commentId?: string | null;
  createdBy: string | null;
}

/** One resource + its parent, as a row ready for `attachments`. Extracted so
    the bulk importer can build a whole batch WITHOUT re-deriving the shape —
    a second copy of it would drift the day a column moves. */
function attachmentRow(parent: AttachmentParent, a: ResourceInput) {
  const columns = {
    project_id: parent.projectId,
    issue_id: parent.issueId ?? null,
    objective_id: parent.objectiveId ?? null,
    feedback_post_id: parent.feedbackPostId ?? null,
    comment_id: parent.commentId ?? null,
    created_by: parent.createdBy,
  };
  // A link weighs nothing and isn't a file: the MIME says "an URL",
  // which is what keeps the type-icon branch of the pill honest.
  return isLinkResource(a)
    ? {
        ...columns,
        kind: "link" as const,
        url: a.url,
        icon_data_url: a.icon_data_url ?? null,
        storage_path: null,
        file_name: a.file_name,
        mime_type: "text/uri-list",
        size_bytes: 0,
      }
    : {
        ...columns,
        kind: "file" as const,
        storage_path: a.storage_path,
        file_name: a.file_name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
      };
}

/** Insert the rows for resources — files already uploaded to storage, links
    already resolved (service client — callers have checked project access).
    The parent is an issue OR an objective OR a feedback post (exactly one —
    the attachments_parent_ck constraint). */
export async function insertAttachments(
  service: SupabaseClient,
  args: AttachmentParent & { resources: ResourceInput[] }
): Promise<Attachment[]> {
  if (args.resources.length === 0) return [];
  const { data, error } = await service
    .from("attachments")
    .insert(args.resources.map((a) => attachmentRow(args, a)))
    .select("*");
  if (error) throw new Error(`resources insert failed: ${error.message}`);
  return (data ?? []) as Attachment[];
}

/**
 * Same insert, but for resources whose parents DIFFER — one link per imported
 * issue (`importIssuesIntoProject`). `insertAttachments` pins a single parent
 * for the whole call, so an import would have to call it once per ticket: 500
 * round-trips where the rest of that module holds one per BATCH. Here the
 * batching survives.
 */
export async function insertAttachmentsFor(
  service: SupabaseClient,
  entries: { parent: AttachmentParent; resource: ResourceInput }[]
): Promise<void> {
  if (entries.length === 0) return;
  const { error } = await service
    .from("attachments")
    .insert(entries.map((e) => attachmentRow(e.parent, e.resource)));
  if (error) throw new Error(`resources insert failed: ${error.message}`);
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

/**
 * Best-effort storage cleanup — a failure must never fail the business write
 * (the leftover is an orphan object, same class as an abandoned upload).
 *
 * Les chemins vides sont écartés ICI, au goulot, parce qu'un seul null empoisonne
 * le LOT ENTIER : `storage.remove()` poste `{ prefixes: [...] }` et le service
 * refuse la requête complète si un élément n'est pas une chaîne — donc plus rien
 * n'est effacé, silencieusement (l'erreur n'est que journalisée). Depuis MIN-184
 * une ressource peut être un LIEN, sans objet dans le bucket : le `storage_path`
 * nul est devenu une valeur ordinaire, et chaque appelant qui ramasse des chemins
 * doit déjà la filtrer. Ce garde-fou est la deuxième ceinture, pour celui qui
 * l'oubliera.
 */
export async function removeStorageObjects(
  service: SupabaseClient,
  paths: (string | null | undefined)[]
): Promise<void> {
  const cleaned = paths.filter((p): p is string => typeof p === "string" && p !== "");
  if (cleaned.length === 0) return;
  try {
    const { error } = await service.storage.from("attachments").remove(cleaned);
    if (error) {
      console.error("[attachments] storage cleanup failed:", error.message);
    }
  } catch (e) {
    console.error("[attachments] storage cleanup failed:", (e as Error).message);
  }
}
