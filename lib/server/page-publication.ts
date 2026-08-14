import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { signedAttachmentUrl } from "@/lib/server/attachments";
import { isInlineSafeMimeType } from "@/lib/inline-safe";
import { pageFileIdFromSrc } from "@/lib/page-files";
import { descendantIds } from "@/lib/pages";
import {
  getPublicPageShareByToken,
  type PublicPageShareContext,
} from "@/lib/server/view-shares";

/**
 * Ce qu'une PAGE PUBLIÉE donne à voir à quelqu'un qui n'a pas de compte
 * (MIN-283) — et, tout aussi important, ce qu'elle ne donne pas.
 *
 * Le rendu public n'est pas une seconde vue de la page : c'est la MÊME surface
 * (l'éditeur monté en lecture seule), nourrie d'un document dont on a retiré
 * tout ce qui mènerait ailleurs. Ce module est cet endroit-là, et il est le
 * seul :
 *
 *  - les SOUS-PAGES ne sont résolues que dans l'ENSEMBLE PUBLIÉ (la page seule,
 *    ou sa branche quand `include_children`). Une sous-page hors de cet
 *    ensemble n'est pas « masquée » : son titre ne sort tout simplement pas
 *    d'ici, et le bloc se rend inerte côté client faute de savoir quoi en dire.
 *    Un bloc qui affiche « Spécification tarifs 2027 » barré est déjà une fuite ;
 *  - les FICHIERS et les IMAGES (MIN-280) sont servis par des URL signées
 *    posées ICI, au rendu, et seulement pour les fichiers des pages publiées.
 *    Le bucket reste privé et la route d'application (`/api/projects/…`), elle,
 *    reste fermée aux visiteurs anonymes : c'est le document qui voyage avec
 *    ses adresses, pas la porte qui s'ouvre ;
 *  - les MENTIONS n'ont rien à neutraliser, et c'est le modèle qui l'offre :
 *    une mention est du TEXTE dans le document, la pilule n'étant reposée qu'à
 *    la lecture par la surface qui en a les sources (MIN-269). Le rendu public
 *    ne les lui donne pas, donc « @Clément » reste « @Clément » — sans avatar,
 *    sans lien, sans rien apprendre du projet.
 */

/** Une page de l'ensemble publié, telle que le rendu la nomme. */
export interface PublicPageNode {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
}

export interface PublicPageBundle {
  share: PublicPageShareContext["share"];
  project: PublicPageShareContext["project"];
  /** La page RACINE de la publication — celle que le token désigne. */
  root: PublicPageNode;
  /** La page effectivement rendue (la racine, ou une page de sa branche). */
  page: PublicPageNode & { updated_at: string };
  /** Le corps, adresses de fichiers déjà signées. */
  content: unknown;
  /** Tout l'ensemble publié : ce que les blocs sous-page ont le droit de nommer. */
  pages: PublicPageNode[];
  /** Le chemin depuis la racine publiée jusqu'à la page rendue (exclue). */
  trail: PublicPageNode[];
}

/** Durée de vie des URL signées d'une page publiée.
 *
 * Bien plus longue que les dix minutes de la porte d'application : ces URL sont
 * posées dans un document qu'on lit d'une traite, qu'on imprime en PDF, et
 * qu'un onglet peut garder ouvert une journée. Bien plus courte, en revanche,
 * qu'« indéfiniment » — une URL signée qui fuit hors de la page publiée doit
 * finir par ne plus rien servir. Vingt-quatre heures est le compromis, et le
 * rendu étant fait à chaque requête, un rechargement en pose de neuves. */
const PUBLIC_FILE_URL_TTL_SECONDS = 24 * 3600;

/**
 * Le bundle d'une page publiée, ou `null` (→ 404).
 *
 * `pageId` désigne une page de la BRANCHE publiée : c'est ainsi qu'on navigue
 * d'une page publiée à ses sous-pages sans jamais forger de second token. Une
 * page hors de la branche — ou une branche non publiée — rend `null`, comme un
 * token inconnu : le visiteur n'apprend pas qu'elle existe.
 */
export async function getPublicPageBundle(
  token: string,
  pageId?: string
): Promise<PublicPageBundle | null> {
  const ctx = await getPublicPageShareByToken(token);
  if (!ctx) return null;

  const service = getServiceClient();
  const root: PublicPageNode = {
    id: ctx.page.id,
    parent_id: ctx.page.parent_id,
    title: ctx.page.title,
    icon: ctx.page.icon,
  };

  // L'ensemble publié. Sans `include_children`, il tient en une page — et c'est
  // la garantie qui compte : aucun titre d'enfant n'est même LU.
  let pages: PublicPageNode[] = [root];
  if (ctx.share.include_children) {
    const { data } = await service
      .from("pages")
      .select("id, parent_id, title, icon, position")
      .eq("project_id", ctx.project.id)
      .is("deleted_at", null);
    const all = (data ?? []) as Array<PublicPageNode & { position: string }>;
    const inBranch = descendantIds(all, root.id);
    pages = [
      root,
      ...all
        .filter((p) => inBranch.includes(p.id))
        .map((p) => ({ id: p.id, parent_id: p.parent_id, title: p.title, icon: p.icon })),
    ];
  }

  const targetId = pageId ?? root.id;
  if (!pages.some((p) => p.id === targetId)) return null;

  const { data: pageRow } = await service
    .from("pages")
    .select("id, parent_id, title, icon, content, updated_at")
    .eq("id", targetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!pageRow) return null;

  const publishedIds = new Set(pages.map((p) => p.id));
  const content = await signPublicFileUrls(pageRow.content, publishedIds);

  return {
    share: ctx.share,
    project: ctx.project,
    root,
    page: {
      id: pageRow.id as string,
      parent_id: (pageRow.parent_id as string | null) ?? null,
      title: (pageRow.title as string) ?? "",
      icon: (pageRow.icon as string | null) ?? null,
      updated_at: pageRow.updated_at as string,
    },
    content,
    pages,
    trail: trailWithin(pages, root.id, targetId),
  };
}

/**
 * Le chemin de la racine publiée jusqu'à `pageId`, la page rendue exclue.
 *
 * Il ne remonte JAMAIS au-dessus de la racine : le fil d'Ariane d'une page
 * publiée ne dit rien de l'endroit du wiki d'où elle vient.
 */
function trailWithin(
  pages: PublicPageNode[],
  rootId: string,
  pageId: string
): PublicPageNode[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const trail: PublicPageNode[] = [];
  let current = byId.get(pageId)?.parent_id ?? null;
  while (current) {
    const node = byId.get(current);
    if (!node) break;
    trail.unshift(node);
    if (node.id === rootId) break;
    current = node.parent_id;
  }
  return trail;
}

/**
 * Les `src` de fichiers du corps, remplacés par des URL signées.
 *
 * La traversée est aveugle au type de nœud, comme `pageFileIdsInBody` : tout
 * attribut qui ressemble à l'adresse d'un fichier de page compte, et un bloc de
 * plus qui en porterait un est couvert d'avance.
 *
 * Un fichier dont la page N'EST PAS publiée voit son `src` retiré plutôt que
 * laissé tel quel : l'URL d'application ne répondrait de toute façon pas à un
 * visiteur anonyme, mais elle dirait le projet et l'identifiant du fichier.
 * Le bloc se rend alors « indisponible », ce qu'il sait déjà faire.
 */
export async function signPublicFileUrls(
  content: unknown,
  publishedPageIds: Set<string>
): Promise<unknown> {
  const ids = new Set<string>();
  walkSrc(content, (src) => {
    const id = pageFileIdFromSrc(src);
    if (id) ids.add(id);
    return undefined;
  });
  if (ids.size === 0) return content;

  const service = getServiceClient();
  const { data } = await service
    .from("page_files")
    .select("id, page_id, storage_path, file_name, mime_type")
    .in("id", [...ids]);

  const signed = new Map<string, string>();
  type FileRow = {
    id: string;
    page_id: string;
    storage_path: string;
    file_name: string;
    mime_type: string | null;
  };
  await Promise.all(
    ((data ?? []) as FileRow[]).map(async (row) => {
      if (!publishedPageIds.has(row.page_id)) return;
      const url = await signedAttachmentUrl(service, row.storage_path, {
        expiresIn: PUBLIC_FILE_URL_TTL_SECONDS,
        // Une IMAGE doit s'afficher dans le document ; tout le reste est un
        // fichier qu'on vient chercher, et son bloc est un bouton de
        // téléchargement (blocks/file-view.tsx). La disposition se décide à la
        // SIGNATURE : l'ajouter en paramètre après coup ne signerait rien.
        //
        // « Image » au sens de l'allowlist et non du préfixe `image/` : une page
        // publiée est lisible par n'importe qui, et un `image/svg+xml` est un
        // document exécutable, pas une image (MIN-340).
        download: isInlineSafeMimeType(row.mime_type) ? false : row.file_name,
        mimeType: row.mime_type,
      });
      if (url) signed.set(row.id, url);
    })
  );

  return walkSrc(content, (src) => {
    const id = pageFileIdFromSrc(src);
    if (!id) return undefined;
    return signed.get(id) ?? null;
  });
}

/**
 * Recopie le document en remplaçant les chaînes que `map` réécrit — `undefined`
 * laisse la valeur en place, `null` retire l'attribut.
 *
 * Une COPIE et pas une mutation : le document vient d'une lecture, et rien ne
 * dit qu'il n'est pas partagé avec un cache de requête.
 */
function walkSrc(
  node: unknown,
  map: (src: string) => string | null | undefined
): unknown {
  if (Array.isArray(node)) return node.map((child) => walkSrc(child, map));
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === "string") {
      const replaced = map(value);
      if (replaced === undefined) out[key] = value;
      else if (replaced !== null) out[key] = replaced;
      else out[key] = null;
    } else if (value && typeof value === "object") {
      out[key] = walkSrc(value, map);
    } else {
      out[key] = value;
    }
  }
  return out;
}
