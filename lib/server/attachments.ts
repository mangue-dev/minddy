import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isInlineSafeMimeType, resolveUploadedMimeType } from "@/lib/inline-safe";
import { getProjectAccess } from "@/lib/server/project-access";
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
  // Le type est déduit des OCTETS, pas de ce que l'appelant annonce (MIN-340) :
  // ici on tient le contenu, donc on n'a aucune raison de le croire sur parole.
  // C'est ce type-là qui part dans l'entête de l'objet ET dans la ligne, pour
  // que les deux disent la même chose au moment de servir.
  const mime = resolveUploadedMimeType(args.mimeType, args.data).slice(0, 120);
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
 * QUI A TÉLÉVERSÉ L'OBJET (MIN-343).
 *
 * `parseResourcesInput` ne contrôle que le PRÉFIXE du chemin (`projects/{id}/`) :
 * il dit dans quel projet le fichier vit, jamais à qui il appartient. Un membre
 * pouvait donc enregistrer une ressource pointant sur le fichier d'un collègue —
 * et la suppression, qui filtre bien sur `created_by`, effaçait alors l'objet
 * d'un autre en croyant n'effacer que sa propre ligne.
 *
 * Le téléverseur, c'est le storage qui le sait : un envoi direct depuis le
 * navigateur porte le JWT de son auteur, et `storage.objects.owner_id` le garde.
 * Le schéma `storage` n'est pas exposé par PostgREST, d'où la fonction
 * `attachment_object_owners` (SECURITY DEFINER, EXECUTE au seul rôle de service).
 *
 * Deux tolérances, dites plutôt que subies :
 *
 *  - **owner nul** — l'objet a été créé par minddy lui-même (envoi côté serveur
 *    du MCP, copie inter-projets). Ces objets-là sont créés à côté de leur ligne,
 *    et le vrai dégât — la destruction — est fermé de l'autre bout par
 *    {@link removeStorageObjects}, qui ne retire plus un objet encore référencé.
 *  - **objet absent** — une ligne qui nomme un objet inexistant ne sert rien et
 *    ne détruit rien ; la refuser ferait tomber en silence des enregistrements
 *    légitimes le jour où le storage répond avec un temps de retard.
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
  // Même garde qu'à l'unité, groupée par téléverseur : l'import n'écrit que des
  // liens aujourd'hui, et c'est exactement le genre d'appelant qui recevrait des
  // fichiers demain sans que personne pense à la garde.
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
 * Le type MIME que le BUCKET servira pour cet objet — celui posé à l'envoi, et
 * donc la seule vérité sur ce que le navigateur recevra.
 *
 * Il est demandé au storage et non lu sur la ligne : le `mime_type` d'une ligne
 * est ce que le client a DÉCLARÉ au moment de l'enregistrement, sans rapport
 * obligé avec l'entête que l'objet porte (une ressource de ticket monte
 * directement du navigateur au bucket, l'entête comprise). Rendre `""` en cas
 * d'échec ferme la porte : hors allowlist, donc `attachment`.
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
 * Le SEUL goulot par lequel un fichier privé devient une URL — d'où la garde
 * `inline` ici et non chez les cinq appelants (MIN-340) : ce qui n'est pas dans
 * l'allowlist ({@link isInlineSafeMimeType}) repart en `attachment`, quoi qu'ait
 * demandé l'appelant. Une disposition « pièce jointe » ne rend jamais rien, donc
 * n'exécute jamais rien, et elle laisse l'image s'afficher dans un `<img>` — la
 * disposition ne gouverne que la navigation.
 *
 * `mimeType` est le type que l'appelant tient DÉJÀ pour ce fichier (la ligne
 * `page_files`, dont le type est sniffé à l'envoi) : le passer évite l'aller-
 * retour `info()`. Sans lui, on va le demander au storage.
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
 * Les chemins d'un lot que PLUS AUCUNE ligne ne nomme (MIN-343) — les seuls dont
 * les octets peuvent partir.
 *
 * Un même objet peut être cité par deux lignes : deux tables le référencent
 * (`attachments`, `page_files`), et rien n'empêche deux lignes de la même table
 * de nommer le même chemin. Supprimer une ligne suffisait alors à emporter
 * l'objet des autres — la ligne survivante devenait une pièce jointe morte, et
 * dans le cas qui a ouvert ce ticket c'était le fichier d'un collègue.
 *
 * Appelé au goulot ci-dessous, donc valable pour les huit endroits qui font le
 * ménage, et pas seulement pour celui où on a vu le défaut. L'ordre attendu est
 * celui que tous respectent déjà : la LIGNE d'abord, les octets ensuite.
 */
async function unreferencedPaths(
  service: SupabaseClient,
  paths: string[]
): Promise<string[]> {
  const held = new Set<string>();
  // Par tranches : un vidage de corbeille ou une purge de rétention en apporte
  // des centaines, et une clause `in` illimitée finit par dépasser l'URL.
  const CHUNK = 100;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const slice = paths.slice(i, i + CHUNK);
    for (const table of ["attachments", "page_files"] as const) {
      const { data, error } = await service
        .from(table)
        .select("storage_path")
        .in("storage_path", slice);
      if (error) {
        // On ne sait plus qui référence quoi : on ne supprime rien de cette
        // tranche. Un orphelin coûte des octets, une suppression de trop coûte
        // le fichier de quelqu'un.
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
 * Ne retire QUE les objets que plus aucune ligne ne nomme ({@link unreferencedPaths}).
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
