import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isInlineSafeMimeType, resolveUploadedMimeType } from "@/lib/inline-safe";
import { getProjectAccess } from "@/lib/server/project-access";
import { projectStorageAllowed } from "@/lib/server/storage-quota";
import type {
  Attachment,
  LinkResourceInput,
  PageResourceInput,
  ResourceInput,
} from "@/lib/types";
import { isLinkResource, isPageResource } from "@/lib/types";

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

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * The page half of {@link parseResourcesInput} (MIN-275). Only the shape is
 * checked here — that the page exists, lives in the parent's project and isn't
 * in the trash is a question for the database, answered at the single write
 * choke point ({@link insertAttachments}).
 */
function parsePageResource(a: Record<string, unknown>): PageResourceInput | null {
  if (typeof a.page_id !== "string" || !UUID_RE.test(a.page_id.trim())) return null;
  // A page resource carries neither bytes nor an address: anything else in the
  // payload is a caller confusing the three kinds.
  if (a.storage_path != null || a.url != null) return null;
  const fileName =
    typeof a.file_name === "string" ? a.file_name.trim().slice(0, 200) : "";
  return {
    kind: "page",
    page_id: a.page_id.trim(),
    // An untitled page is the ordinary state of a page just created; the live
    // join is what names it anyway.
    file_name: fileName || "Page",
  };
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
    if (kind !== "file" && kind !== "link" && kind !== "page") return null;

    if (kind === "link") {
      const link = parseLinkResource(a);
      if (!link) return null;
      out.push(link);
      continue;
    }

    if (kind === "page") {
      const page = parsePageResource(a);
      if (!page) return null;
      out.push(page);
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
  // The type is inferred from BYTES, not from what the caller announces (MIN-340):
  // here we hold the content, so we have no reason to take his word for it.
  // It is this type which goes into the header of the object AND into the line, to
  // that both say the same thing when serving.
  const mime = resolveUploadedMimeType(args.mimeType, args.data).slice(0, 120);
  // The account quota (MIN-348): this sending comes from the SERVICE client, who
  // does not see the policy where the ceiling is placed.
  if (!(await projectStorageAllowed(service, args.projectId))) {
    throw new Error("attachment upload refused: storage quota exceeded");
  }
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
 * A LINK has no storage object to copy — it goes through untouched. A PAGE
 * belongs to a project and cannot follow: it is kept only when the target
 * project is already its own.
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
    // A PAGE belongs to one project and doesn't travel: the ticket created in
    // another project would cite a page nobody there can open. Dropped like an
    // unreachable file, not refused — the rest of the creation goes through.
    if (isPageResource(a)) {
      const { data: page } = await service
        .from("pages")
        .select("id")
        .eq("id", a.page_id)
        .eq("project_id", args.targetProjectId)
        .is("deleted_at", null)
        .maybeSingle();
      if (page) out.push(a);
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
  if (isLinkResource(a)) {
    return {
      ...columns,
      kind: "link" as const,
      url: a.url,
      icon_data_url: a.icon_data_url ?? null,
      storage_path: null,
      page_id: null,
      file_name: a.file_name,
      mime_type: "text/uri-list",
      size_bytes: 0,
    };
  }
  // A page is neither: no bytes, no address — a foreign key, and a snapshot of
  // the title for whoever reads the row without the join (MIN-275).
  if (isPageResource(a)) {
    return {
      ...columns,
      kind: "page" as const,
      page_id: a.page_id,
      storage_path: null,
      url: null,
      file_name: a.file_name,
      mime_type: "application/vnd.minddy.page",
      size_bytes: 0,
    };
  }
  return {
    ...columns,
    kind: "file" as const,
    storage_path: a.storage_path,
    page_id: null,
    file_name: a.file_name,
    mime_type: a.mime_type,
    size_bytes: a.size_bytes,
  };
}

/**
 * A resource pointing at a page that isn't a live page of the parent's project
 * (MIN-275). Typed because the routes answer 400 on it — a client naming
 * someone else's page is a malformed request, not a server failure.
 */
export class ResourceScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceScopeError";
  }
}

/**
 * The one place a page resource is checked against its project.
 *
 * `parseResourcesInput` is pure — it validates shapes, and can't ask the
 * database anything. So the check lives at the WRITE choke point instead, where
 * every writer passes: the resources routes, ticket and objective creation, the
 * MCP tool, Numo, the importer. A guard on each of those would be six guards,
 * and the seventh writer would be written without one.
 *
 * Trashed pages are refused too: citing a page nobody can open would produce a
 * resource that is inert from birth.
 */
async function assertPagesInProject(
  service: SupabaseClient,
  projectId: string,
  resources: ResourceInput[]
): Promise<void> {
  const ids = [...new Set(resources.filter(isPageResource).map((r) => r.page_id))];
  if (ids.length === 0) return;
  const { data, error } = await service
    .from("pages")
    .select("id")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .in("id", ids);
  if (error) throw new Error(`page resource check failed: ${error.message}`);
  const live = new Set((data ?? []).map((p) => (p as { id: string }).id));
  const missing = ids.filter((id) => !live.has(id));
  if (missing.length > 0) {
    throw new ResourceScopeError(
      `page not found in this project: ${missing.join(", ")}`
    );
  }
}

/**
 * WHO UPLOADED THE OBJECT (MIN-343).
 *
 * `parseResourcesInput` only controls the PREFIX of the path (`projects/{id}/`):
 * it says in which project the file lives, never who it belongs to. A member
 * could therefore save a resource pointing to a colleague's file —
 * and the deletion, which filters of course on `created_by`, then deleted the object
 * of another while believing that it was only deleting its own line.
 *
 * The uploader, it is the storage which knows: a direct sending from the
 * browser carries the JWT of its author, and `storage.objects.owner_id` keeps it.
 * The `storage` schema is not exposed by PostgREST, hence the function
 * __keep server
 * of the MCP, cross-project copy). These objects are created next to their line,
 * and the real damage - destruction - is closed at the other end by
 * {@link removeStorageObjects}, which no longer removes an object still referenced.
 * - **absent object** — a line which names a non-existent object is useless and
 * does not destroy anything; refusing it would silently drop legitimate records
 * on the day the storage responds with a delay.
 */
async function assertUploadedByActor(
  service: SupabaseClient,
  createdBy: string | null,
  resources: ResourceInput[]
): Promise<void> {
  const paths = [
    ...new Set(
      resources
        .filter((r) => !isLinkResource(r) && !isPageResource(r))
        .map((r) => (r as { storage_path: string }).storage_path)
    ),
  ];
  if (paths.length === 0) return;

  const { data, error } = await service.rpc("attachment_object_owners", { paths });
  if (error) throw new Error(`resource owner check failed: ${error.message}`);

  const owners = new Map<string, string | null>();
  for (const row of (data ?? []) as { name: string; owner_id: string | null }[]) {
    owners.set(row.name, row.owner_id);
  }
  const stolen = paths.filter((p) => {
    const owner = owners.get(p);
    return owner != null && owner !== createdBy;
  });
  if (stolen.length > 0) {
    throw new ResourceScopeError(
      `file uploaded by someone else: ${stolen.join(", ")}`
    );
  }
}

/** Insert the rows for resources — files already uploaded to storage, links
    already resolved, pages cited by id (service client — callers have checked
    project access). The parent is an issue OR an objective OR a feedback post
    (exactly one — the attachments_parent_ck constraint). */
export async function insertAttachments(
  service: SupabaseClient,
  args: AttachmentParent & { resources: ResourceInput[] }
): Promise<Attachment[]> {
  if (args.resources.length === 0) return [];
  await assertPagesInProject(service, args.projectId, args.resources);
  await assertUploadedByActor(service, args.createdBy, args.resources);
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
  // Same guard as insertAttachments, per project — an import batch can carry
  // several (the importer writes into one project at a time, but nothing in the
  // signature says so).
  const byProject = new Map<string, ResourceInput[]>();
  for (const e of entries) {
    const list = byProject.get(e.parent.projectId) ?? [];
    list.push(e.resource);
    byProject.set(e.parent.projectId, list);
  }
  for (const [projectId, resources] of byProject) {
    await assertPagesInProject(service, projectId, resources);
  }
  // Same guard as for the unit, grouped by uploader: the import only writes
  // links today, and this is exactly the kind of caller who would receive
  // files tomorrow without anyone thinking about custody.
  const byActor = new Map<string | null, ResourceInput[]>();
  for (const e of entries) {
    const list = byActor.get(e.parent.createdBy) ?? [];
    list.push(e.resource);
    byActor.set(e.parent.createdBy, list);
  }
  for (const [createdBy, resources] of byActor) {
    await assertUploadedByActor(service, createdBy, resources);
  }
  const { error } = await service
    .from("attachments")
    .insert(entries.map((e) => attachmentRow(e.parent, e.resource)));
  if (error) throw new Error(`resources insert failed: ${error.message}`);
}

/**
 * The MIME type that the BUCKET will serve for this object — the one set when sending, and
 * therefore the only truth about what the browser will receive.
 *
 * It is requested in storage and not read on the line: the `mime_type` of a line
 * is what the client DECLARED at the time of registration, unrelated
 * required with the header that the object carries (a ticket resource rises
 * directly from the browser to the bucket, including the header). Returning `""` in case
 * of failure closes the door: outside allowlist, so `attachment`.
 */
async function storedContentType(
  service: SupabaseClient,
  storagePath: string
): Promise<string> {
  try {
    const { data } = await service.storage.from("attachments").info(storagePath);
    return data?.contentType ?? "";
  } catch {
    return "";
  }
}

/**
 * Short-lived signed URL on the private bucket (service role bypasses the
 * absence of a storage select policy). Null when the object is missing.
 *
 * The ONLY neck by which a private file becomes a URL — hence the keeping
 * `inline` here and not in the five callers (MIN-340): which is not in
 * the allowlist ({@link isInlineSafeMimeType}) returns to `attachment`, whatever
 * requested by the caller. An "attachment" layout never renders anything, so
 * never executes anything, and it leaves the image displayed in a `<img>` — the
 * layout only governs navigation.
 *
 * `mimeType` is the type that the caller ALREADY holds for this file (the line
 * `page_files`, whose type is sniffed when sending): passing it avoids the forward-
 * return `info()`. Without it, we will request it from storage.
 */
export async function signedAttachmentUrl(
  service: SupabaseClient,
  storagePath: string,
  {
    download = false,
    expiresIn = 600,
    mimeType,
  }: {
    download?: string | boolean;
    expiresIn?: number;
    /** Type de confiance, quand l'appelant en tient un (voir ci-dessus). */
    mimeType?: string | null;
  } = {}
): Promise<string | null> {
  let disposition: string | boolean = download;
  if (!disposition) {
    const type = mimeType ?? (await storedContentType(service, storagePath));
    if (!isInlineSafeMimeType(type)) disposition = true;
  }

  const { data, error } = await service.storage
    .from("attachments")
    .createSignedUrl(storagePath, expiresIn, disposition ? { download: disposition } : undefined);
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
 * The paths of a batch that NO MORE lines name (MIN-343) — the only ones from which
 * the bytes can leave.
 *
 * The same object can be cited by two lines: two tables reference it
 * (`attachments`, `page_files`), and nothing prevents two rows in the same table
 * from naming the same path. Deleting one line was then enough to take away
 * the object of the others — the surviving line became a dead attachment, and
 * in the case which opened this ticket it was a colleague's file.
 *
 * Called at the bottleneck below, therefore valid for the eight places which do the
 * household, and not only for the one where we saw the defect. The expected order is
 * the one that everyone already respects: the LINE first, the bytes then.
 */
async function unreferencedPaths(
  service: SupabaseClient,
  paths: string[]
): Promise<string[]> {
  const held = new Set<string>();
  // In installments: an emptying of the trash or a retention purge brings some
  // hundreds, and an unlimited `in` clause ends up overtaking the URL.
  const CHUNK = 100;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const slice = paths.slice(i, i + CHUNK);
    for (const table of ["attachments", "page_files"] as const) {
      const { data, error } = await service
        .from(table)
        .select("storage_path")
        .in("storage_path", slice);
      if (error) {
        // We no longer know who references what: we do not delete anything from this
        // slice. An orphan costs bytes, too much deletion costs
        // someone's file.
        console.error(`[attachments] reference check failed (${table}):`, error.message);
        slice.forEach((p) => held.add(p));
        continue;
      }
      for (const row of (data ?? []) as { storage_path: string | null }[]) {
        if (row.storage_path) held.add(row.storage_path);
      }
    }
  }
  return paths.filter((p) => !held.has(p));
}

/**
 * Best-effort storage cleanup — a failure must never fail the business write
 * (the leftover is an orphan object, same class as an abandoned upload).
 *
 * ONLY removes objects that are no longer named in any line ({@link unreferencedPaths}).
 *
 * Empty paths are discarded HERE, at the bottleneck, because a single null poisons
 * the ENTIRE BATCH: `storage.remove()` posts `{ prefixes: [...] }` and the service
 * refuses the entire query if an element is not a string — so no more nothing
 * is erased, silently (the error is only logged). Since MIN-184
 * a resource can be a LINK, without an object in the bucket: the `storage_path`
 * null has become an ordinary value, and each caller that picks up paths
 * must already filter it. This guardrail is the second belt, for those who
 * forget it.
 */
export async function removeStorageObjects(
  service: SupabaseClient,
  paths: (string | null | undefined)[]
): Promise<void> {
  const cleaned = [
    ...new Set(paths.filter((p): p is string => typeof p === "string" && p !== "")),
  ];
  if (cleaned.length === 0) return;
  const orphans = await unreferencedPaths(service, cleaned);
  if (orphans.length === 0) return;
  try {
    const { error } = await service.storage.from("attachments").remove(orphans);
    if (error) {
      console.error("[attachments] storage cleanup failed:", error.message);
    }
  } catch (e) {
    console.error("[attachments] storage cleanup failed:", (e as Error).message);
  }
}

/** Remove pre-uploaded file objects whose resource rows could not be retained.
 * Shared-reference checks inside removeStorageObjects make this safe when a
 * descriptor points at an object that another live row still owns. */
export async function removeUnretainedResources(
  service: SupabaseClient,
  resources: ResourceInput[],
): Promise<void> {
  await removeStorageObjects(
    service,
    resources.map((resource) =>
      isLinkResource(resource) || isPageResource(resource)
        ? null
        : resource.storage_path,
    ),
  );
}

/** The grace period for an orphaned object in the `attachments` bucket (MIN-348).
 Aligned with that of page files (ORPHAN_PAGE_FILE_DAYS): this is the same
 kind of accident — a successful send and a line that never came — and two different deadlines for a same phenomenon would be two
 things to remember instead of one. */
export const ORPHAN_ATTACHMENT_DAYS = 7;

/**
 * Objects in the bucket that are no longer designated by any line, after the timeout.
 *
 * Sending an attachment is DIRECT-TO-STORAGE: the bytes leave the
 * browser before the resource is saved, and everything that happens
 * in between — a composer closed, a tab lost, a creation canceled —
 * leaves the object alone in the bucket. Nobody showed it anymore, nobody counted it, and nothing deleted it.
 *
 * Sorting is in SQL (`orphan_attachment_objects`): the object table lives in
 * the `storage` schema, which PostgREST does not expose, and "this path is cited
 * nowhere” is exactly what an anti-join can do and we can't.
 *
 * Bounded batch like other nightly sweep purges; the next day resumes
 * the rest. Returns the number of objects actually deleted.
 */
export async function sweepOrphanAttachments(
  service: SupabaseClient,
  before: string,
  limit = 500
): Promise<number> {
  const { data, error } = await service.rpc("orphan_attachment_objects", {
    p_before: before,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);

  const paths = ((data ?? []) as { name: string }[]).map((row) => row.name);
  if (paths.length === 0) return 0;

  // Not `removeStorageObjects`: its rereading “is this path still mentioned? »
  // just made by the query above, on both tables and in one
  // times. Redoing it path by path would cost half the sweep.
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error: removeError } = await service.storage
      .from("attachments")
      .remove(chunk);
    if (removeError) {
      console.error("[attachments] orphan sweep failed:", removeError.message);
      break;
    }
    removed += chunk.length;
  }
  return removed;
}
