import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { FORGE_ATTACHMENTS_BUCKET } from "@/lib/forge-image-assets";

/**
 * Les objets d'un projet qui ne vivent PAS dans le bucket `attachments`
 * (MIN-296).
 *
 * Trois buckets portent des données de projet, et deux d'entre eux sont publics
 * en lecture : `project-icons` (l'icône téléversée) et `forge-attachments` (les
 * fichiers joints aux commentaires de pull request). Aucun des deux ne cascade,
 * et aucun n'était balayé — ni à la purge d'un projet, ni à la suppression d'un
 * compte. Un projet effacé laissait donc son icône et les images de ses PR
 * servies par leur URL, sans plus rien en base pour les désigner : exactement le
 * « fichier promis supprimé, toujours en stockage » que l'audit traque.
 *
 * Les chemins se relèvent AVANT le delete — après, la cascade a emporté les
 * lignes qui disent où ils sont.
 */

/** Ce qu'une page de `list()` ramène au plus (plafond de l'API Storage). */
const LIST_PAGE = 1000;

/**
 * Liste récursivement les objets d'un préfixe (l'API Storage ne descend pas), en
 * PAGINANT : `list()` s'arrête à mille entrées sans dire qu'il en reste.
 */
export async function listStoragePrefix(
  service: SupabaseClient,
  bucket: string,
  prefix: string,
  depth = 0
): Promise<string[]> {
  // Garde-fou : les arborescences visées font quatre niveaux au plus. Plus
  // profond n'aurait ici qu'une cause — une boucle.
  if (depth > 4) return [];

  const paths: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await service.storage
      .from(bucket)
      .list(prefix, { limit: LIST_PAGE, offset });
    if (error || !data) return paths;

    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Un « dossier » Storage est une entrée sans métadonnées.
      if (entry.id === null || entry.metadata === null) {
        paths.push(...(await listStoragePrefix(service, bucket, full, depth + 1)));
      } else {
        paths.push(full);
      }
    }

    if (data.length < LIST_PAGE) return paths;
  }
}

/** Les icônes téléversées des projets donnés — une par projet, extension
    inconnue (d'où le listage du préfixe plutôt qu'un chemin déduit). */
export async function projectIconPaths(
  service: SupabaseClient,
  projectIds: string[]
): Promise<string[]> {
  const paths: string[] = [];
  for (const id of projectIds) {
    paths.push(...(await listStoragePrefix(service, "project-icons", id)));
  }
  return paths;
}

/**
 * Les objets `forge-attachments` des projets donnés.
 *
 * Le chemin d'une pièce jointe de commentaire de PR est `{pr_id}/{uuid}/{nom}`
 * (MIN-162) : il ne dit pas le projet. On redescend donc la chaîne qui l'y
 * rattache — projets → dépôts liés (`project_git_links`) → PR de ces dépôts.
 *
 * Une PR appartient à un DÉPÔT, pas à un projet, et deux projets peuvent lier le
 * même : on n'efface que si aucun projet survivant ne le lie encore. Sans ce
 * filtre, purger un projet emporterait les images des commentaires d'une équipe
 * qui, elle, reste.
 */
export async function forgeAttachmentPathsForProjects(
  service: SupabaseClient,
  projectIds: string[]
): Promise<string[]> {
  if (projectIds.length === 0) return [];

  const { data: links } = await service
    .from("project_git_links")
    .select("project_id, provider, repo_full_name")
    .not("repo_full_name", "is", null);
  const rows = (links ?? []) as Array<{
    project_id: string;
    provider: string;
    repo_full_name: string;
  }>;
  if (rows.length === 0) return [];

  const key = (l: { provider: string; repo_full_name: string }) =>
    `${l.provider} ${l.repo_full_name}`;
  const survivors = new Set(
    rows.filter((l) => !projectIds.includes(l.project_id)).map(key)
  );
  const doomed = rows.filter(
    (l) => projectIds.includes(l.project_id) && !survivors.has(key(l))
  );

  const paths: string[] = [];
  for (const link of doomed) {
    const { data: prs } = await service
      .from("pull_requests")
      .select("id")
      .eq("provider", link.provider)
      .eq("repo_full_name", link.repo_full_name);
    for (const pr of (prs ?? []) as Array<{ id: string }>) {
      paths.push(
        ...(await listStoragePrefix(service, FORGE_ATTACHMENTS_BUCKET, pr.id))
      );
    }
  }
  return paths;
}

/**
 * Efface un lot d'objets d'un bucket. Ne lève JAMAIS : un ménage raté ne doit
 * pas faire échouer la purge ou l'effacement de compte qui l'a déclenché — il
 * rend ce qu'il n'a pas pu faire, à l'appelant d'en faire un avertissement.
 */
export async function removeBucketObjects(
  service: SupabaseClient,
  bucket: string,
  paths: string[]
): Promise<{ removed: number; errors: string[] }> {
  const errors: string[] = [];
  let removed = 0;
  // Storage plafonne un `remove` : on découpe.
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    try {
      const { error } = await service.storage.from(bucket).remove(chunk);
      if (error) errors.push(`storage ${bucket}: ${error.message}`);
      else removed += chunk.length;
    } catch (e) {
      errors.push(`storage ${bucket}: ${(e as Error).message}`);
    }
  }
  return { removed, errors };
}

/**
 * Le ménage des deux buckets publics pour un lot de projets qui disparaissent :
 * relève les chemins, efface, rend les avertissements. Appelé APRÈS le delete
 * des lignes quand les chemins ont été relevés avant (purge de la corbeille), ou
 * de bout en bout quand la cascade n'a pas encore eu lieu (suppression de
 * compte).
 */
export async function removeProjectSideBuckets(
  service: SupabaseClient,
  paths: { icons: string[]; forge: string[] }
): Promise<{ removed: number; errors: string[] }> {
  const icons = await removeBucketObjects(service, "project-icons", paths.icons);
  const forge = await removeBucketObjects(
    service,
    FORGE_ATTACHMENTS_BUCKET,
    paths.forge
  );
  return {
    removed: icons.removed + forge.removed,
    errors: [...icons.errors, ...forge.errors],
  };
}
