import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MAX_PAGE_FILE_BYTES,
  pageFileIdsInBody,
  pageFileStoragePrefix,
  sanitizeFileKey,
} from "@/lib/page-files";
import { removeStorageObjects } from "@/lib/server/attachments";

/**
 * Les fichiers d'une page, côté serveur (MIN-280) : l'envoi, et le MÉNAGE.
 *
 * Le ménage est la moitié qui compte. Un envoi branché sans lui, c'est un bucket
 * qui grossit d'images que plus aucun document ne montre, sans que rien ne le
 * dise jamais. Il y a donc trois portes de sortie, et elles se complètent :
 *
 *  - la CASCADE SQL (`page_files.page_id`) efface les LIGNES quand la page part
 *    pour de bon — mais pas les octets, jamais : c'est le piège du sujet, et
 *    c'est pourquoi la purge relève les chemins AVANT de supprimer
 *    (lib/server/trash.ts) ;
 *  - le BALAYAGE des orphelins ({@link sweepOrphanPageFiles}) ramasse ce qui a
 *    quitté le corps sans que la page parte : une image supprimée d'un coup de
 *    retour arrière, un bloc coupé et jamais recollé ;
 *  - et rien d'autre. En particulier, PAS de comparaison à chaque écriture du
 *    corps : elle supprimerait le fichier d'un annuler/refaire entre deux
 *    frappes, et il n'y a pas de retour en arrière sur un objet supprimé.
 */

/** Le délai de grâce d'un orphelin. Sept jours, et le chiffre a une raison :
    un fichier peut sortir d'un corps et y revenir par un `⌘Z` fait le lendemain,
    par la restauration d'une version de l'historique (MIN-277), ou parce que la
    page est passée par la corbeille. Ce qui est encore là au bout d'une semaine,
    lui, ne revient plus. */
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
 * Téléverse les octets, PUIS enregistre la ligne — et efface l'objet si la ligne
 * ne passe pas.
 *
 * Cet ordre-là et pas l'autre : une ligne sans objet donnerait un bloc image qui
 * ne charge jamais, visible dans le document et impossible à réparer ; un objet
 * sans ligne n'est qu'un orphelin, et il ne survit pas au rattrapage ci-dessous.
 * Entre les deux fautes possibles, on choisit toujours celle que le ménage sait
 * réparer.
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

  const mime = args.mimeType.trim().slice(0, 120) || "application/octet-stream";
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

/** Le chemin de storage d'un fichier, si l'acteur peut le voir — la porte de
    lecture (`GET /api/projects/{id}/pages/files/{fileId}`) n'a besoin que de ça.
    Le `project_id` est EXIGÉ : sans lui, un id de fichier valide servirait le
    fichier d'un autre projet à qui saurait forger l'URL. */
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

/** Les chemins de storage des fichiers de ces pages. Relevés AVANT le delete —
    la cascade emporte les lignes, jamais les octets. */
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

/** Idem, à l'échelle d'un PROJET : purger un projet emporte ses pages par
    cascade, donc ses fichiers de page avec. */
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
 * Les fichiers dont plus aucun corps ne parle, passé le délai de grâce.
 *
 * Par BALAYAGE et non par différence à l'écriture (le pourquoi est en tête de ce
 * fichier). La comparaison se fait page par page : les candidats sont groupés
 * par `page_id`, le corps de chaque page est lu une fois, et tout id qui n'y
 * figure plus s'en va — ligne et objet.
 *
 * La lecture du corps est AVEUGLE au type de nœud (`pageFileIdsInBody`) : elle
 * cherche l'adresse du fichier partout dans le JSON. C'est volontairement large,
 * et l'asymétrie est du bon côté — le pire cas est de garder un fichier de trop,
 * jamais d'en effacer un que le document montre encore.
 *
 * Le lot est borné comme les autres purges du balayage ; le lendemain reprend la
 * suite. Rend le nombre de lignes réellement supprimées.
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
    // Une page qui n'est PAS revenue de la lecture n'existe plus (elle vient
    // d'être purgée entre deux balayages) : ses fichiers sont orphelins de
    // plein droit, leurs lignes étant déjà parties par la cascade.
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

  // Les octets APRÈS la ligne : dans l'autre ordre, un échec du delete laisserait
  // une ligne qui nomme un objet disparu — donc un bloc mort dans le document.
  await removeStorageObjects(
    service,
    orphans.map((o) => o.storage_path)
  );
  return count ?? 0;
}
