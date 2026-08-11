import "server-only";

import { contentMentionScanner, type MentionPage } from "@/lib/mention-scan";
import { pageBlockTexts } from "@/lib/pages-mentions";
import { afterOrNow } from "@/lib/server/after-safe";
import type { getServiceClient } from "@/lib/supabase-service";

/**
 * QUI cite une page (MIN-279) — la moitié qu'aucune requête ne pouvait rendre.
 *
 * Un ticket qui cite une page par une RESSOURCE se lit déjà : `attachments`
 * porte une vraie clé étrangère depuis MIN-275, et son index attendait ce
 * ticket-ci. Une MENTION, non — et c'est le contrat des mentions de minddy qui
 * le veut : ce qui est stocké est du TEXTE, « @Titre », re-scanné à la
 * relecture, jamais un nœud persisté. Il n'y a donc rien à interroger, et la
 * seule façon d'obtenir une table des liens est de la DÉRIVER à l'écriture.
 *
 * C'est le geste de `pages.search_text` (MIN-276), au mot près, et il porte les
 * mêmes deux règles :
 *
 * 1. **le client ne l'écrit jamais.** Les lignes se calculent ici, à partir du
 *    texte qui vient d'être écrit et de la liste des pages du projet telle
 *    qu'elle est EN BASE. Un client qui fournirait ses liens ment le jour où il
 *    est vieux, ou celui où il cite une page qu'il n'a pas le droit de voir.
 * 2. **la source est réécrite EN ENTIER.** `delete` de ses lignes, puis
 *    `insert` de celles que le texte porte encore. Un diff incrémental laisse
 *    des liens fantômes dès qu'une écriture échoue à mi-chemin — et un rétrolien
 *    fantôme ne se voit jamais depuis la source qui l'a créé, seulement depuis
 *    la page citée, où personne ne peut le corriger.
 *
 * Et comme la colonne de recherche, ça sort du chemin critique : `afterOrNow`.
 * La sauvegarde d'un éditeur est déjà debouncée à la seconde ; y ajouter deux
 * requêtes pour une table que personne n'attend allongerait chaque frappe.
 */

type Service = ReturnType<typeof getServiceClient>;

/** Ce qui peut citer une page. Le troisième est ce qui fait un réseau. */
export type PageLinkSourceKind = "issue" | "objective" | "page";

export interface PageLinkSource {
  kind: PageLinkSourceKind;
  /** L'id du ticket, de l'objectif ou de la page qui cite. */
  id: string;
  /** Le projet de la SOURCE — et donc celui des pages qu'elle peut citer. */
  projectId: string;
}

/**
 * Les pages CITABLES d'un projet, telles que le scanner les demande.
 *
 * Les corbeillées comprises, et c'est voulu : une page à la corbeille n'est
 * qu'un `deleted_at` (MIN-266), les textes qui la citent la citent toujours, et
 * le rétrolien doit être là quand elle revient. La lecture, elle, la rendra
 * inerte — comme la pilule de ressource le fait déjà.
 *
 * Les pages SANS TITRE sont écartées, et pas par souci d'esthétique : un libellé
 * vide entre dans l'alternance du scanner comme une branche qui matche la chaîne
 * vide, et chaque « @ » du texte deviendrait alors une citation de la page
 * neuve qu'on vient d'ouvrir. Une page sans titre ne se cite pas de toute façon.
 */
async function citablePages(
  service: Service,
  projectId: string
): Promise<MentionPage[]> {
  const { data, error } = await service
    .from("pages")
    .select("id, project_id, title, icon")
    .eq("project_id", projectId);
  if (error) {
    console.error("[page-links] pages read failed:", error.message);
    return [];
  }
  return ((data ?? []) as MentionPage[]).filter((page) => !!page.title?.trim());
}

/**
 * Les pages qu'un TEXTE cite — la règle, isolée de la base pour être
 * vérifiable telle quelle.
 *
 * Le scanner est celui de tout le reste (lib/mention-scan.ts) : c'est ce qui
 * garantit que la pilule affichée dans la description et la ligne écrite ici
 * désignent bien la même page. Une mention tapée à la main, sans passer par le
 * sélecteur, compte donc autant qu'une autre.
 */
export function citedPageIds(text: string, pages: MentionPage[]): string[] {
  if (!text.includes("@") || pages.length === 0) return [];
  const scan = contentMentionScanner({ pages });
  const found = new Set<string>();
  for (const segment of scan(text)) {
    if (segment.mention?.type === "page") found.add(segment.mention.page.id);
  }
  return [...found];
}

/**
 * Le TEXTE d'une source, quelle que soit sa forme.
 *
 * Une description est déjà du texte. Un corps de page est un document
 * ProseMirror, qu'on aplatit bloc par bloc avec le même utilitaire que les
 * notifications de mention (lib/pages-mentions.ts) — et non par la projection
 * markdown : c'est lui qui sait qu'un nœud de mention est ATOMIQUE et rend son
 * « @libellé », alors qu'une mention posée au sélecteur — le cas le plus
 * courant — ne porte aucun texte enfant.
 *
 * Ce qu'il ne ramasse volontairement pas : les blocs SOUS-PAGE. Un parent qui
 * porte le bloc de son enfant ne le « cite » pas au sens de ce panneau — la
 * relation est déjà à l'écran, dans l'arbre et dans le fil d'Ariane, et la
 * répéter en « Cité par » ferait de chaque sous-page une ligne de bruit
 * garantie. Le bloc ne porte pas de texte, il en sort donc naturellement.
 */
export function sourceText(source: {
  description?: string | null;
  doc?: unknown;
}): string {
  if (typeof source.description === "string") return source.description;
  if (source.doc == null) return "";
  return pageBlockTexts(source.doc)
    .map((block) => block.text)
    .join("\n");
}

/**
 * Réécrire les liens d'UNE source. La seule porte d'écriture de la table.
 *
 * Best-effort de bout en bout : rien ne remonte à l'appelant. Un rétrolien
 * perdu ne doit pas faire échouer une écriture réussie — et la prochaine
 * écriture de cette source le rattrapera, puisque la réécriture est entière.
 */
export async function syncPageLinks(
  service: Service,
  source: PageLinkSource,
  text: string
): Promise<void> {
  // On CALCULE avant d'effacer : entre les deux, la source n'a plus de liens, et
  // cette fenêtre doit être aussi courte que possible.
  const targets = text.includes("@")
    ? citedPageIds(text, await citablePages(service, source.projectId))
        // Une page ne se cite pas elle-même. Le scanner, lui, ne le sait pas :
        // il ne voit qu'un titre dans un texte.
        .filter((pageId) => !(source.kind === "page" && pageId === source.id))
    : [];

  const { error: clearError } = await service
    .from("page_links")
    .delete()
    .eq("source_kind", source.kind)
    .eq("source_id", source.id);
  if (clearError) {
    console.error("[page-links] clear failed:", clearError.message);
    return;
  }

  if (targets.length === 0) return;

  const { error: writeError } = await service.from("page_links").insert(
    targets.map((pageId) => ({
      page_id: pageId,
      source_kind: source.kind,
      source_id: source.id,
      project_id: source.projectId,
    }))
  );
  if (writeError) {
    console.error("[page-links] write failed:", writeError.message);
  }
}

/** La même chose, après la réponse — ce qu'appellent les chemins d'écriture. */
export function queuePageLinks(
  service: Service,
  source: PageLinkSource,
  text: string | null | undefined
): void {
  afterOrNow(() => syncPageLinks(service, source, text ?? ""));
}

/**
 * Les liens portés par le CORPS de ces pages, relus depuis la base.
 *
 * Relire coûte une requête et achète l'idempotence, exactement comme
 * `syncPagesSearchText` : rejouer la dérivation sur une page ne peut pas la
 * faire diverger, quel que soit l'ordre dans lequel deux écritures concurrentes
 * se rattrapent. C'est aussi ce qui rend un rattrapage rejouable sans risque.
 */
export async function syncPageBodyLinks(
  service: Service,
  pageIds: string[]
): Promise<void> {
  if (pageIds.length === 0) return;

  const { data, error } = await service
    .from("pages")
    .select("id, project_id, content")
    .in("id", pageIds);
  if (error) {
    console.error("[page-links] body read failed:", error.message);
    return;
  }

  for (const row of (data ?? []) as {
    id: string;
    project_id: string;
    content: unknown;
  }[]) {
    await syncPageLinks(
      service,
      { kind: "page", id: row.id, projectId: row.project_id },
      sourceText({ doc: row.content })
    );
  }
}

/** La même chose, après la réponse. Le seul appelant des chemins d'écriture. */
export function queuePageBodyLinks(service: Service, pageIds: string[]): void {
  if (pageIds.length === 0) return;
  afterOrNow(() => syncPageBodyLinks(service, pageIds));
}
