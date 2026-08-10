/**
 * Le BLOC sous-page vu depuis le document (MIN-272) — logique pure, aucune IO.
 *
 * Le modèle tient en une phrase, et tout le reste en découle : `parent_id` est
 * la VÉRITÉ, le bloc `subpage` n'en est qu'une vue. Une page créée depuis la
 * sidebar n'a aucun bloc dans le corps de son parent, et c'est normal.
 *
 * Ce module est ce que les deux côtés du miroir se partagent :
 *
 *  - le serveur (lib/server/pages.ts) s'en sert pour tenir le corps du PARENT à
 *    jour quand une page part à la corbeille ou en revient — c'est le sens
 *    inverse du ticket, et il doit marcher même quand personne n'a le parent
 *    ouvert, donc il ne peut pas vivre dans l'éditeur ;
 *  - l'éditeur s'en sert pour lire les sous-pages présentes dans un document et
 *    repérer celles qui viennent d'en disparaître.
 *
 * La récursion est essentielle : un bloc sous-page peut être posé DANS un
 * dépliant ou un item de liste. Ne regarder que le premier niveau laisserait
 * derrière un bloc pointant vers le vide — précisément ce que le ticket
 * cherche à empêcher.
 */

import type { PageDocJSON, PageNodeJSON } from "@/lib/pages-merge";

/** Le nom du nœud, tel que le registre le déclare (components/pages/blocks/subpage.ts). */
export const SUBPAGE_TYPE = "subpage";

function childrenOf(node: PageNodeJSON | null | undefined): PageNodeJSON[] {
  return Array.isArray(node?.content) ? (node.content as PageNodeJSON[]) : [];
}

function pageIdOf(node: PageNodeJSON): string | null {
  if (node.type !== SUBPAGE_TYPE) return null;
  const id = node.attrs?.pageId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Les ids de page citée par le document, dans l'ordre de lecture et sans
 * doublon. Un bloc sans `pageId` (posé avant que la création n'aboutisse) n'en
 * fait pas partie : il ne pointe vers rien, il n'y a rien à corbeiller.
 */
export function subpageIdsIn(doc: PageDocJSON | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (nodes: PageNodeJSON[]) => {
    for (const node of nodes) {
      const id = pageIdOf(node);
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
      walk(childrenOf(node));
    }
  };
  walk(childrenOf(doc));
  return out;
}

/** Le document cite-t-il cette page ? */
export function hasSubpage(
  doc: PageDocJSON | null | undefined,
  pageId: string
): boolean {
  return subpageIdsIn(doc).includes(pageId);
}

/**
 * Retire du document tous les blocs qui pointent vers l'une de ces pages.
 *
 * `removed` compte les NŒUDS retirés, pas les pages : un même parent peut citer
 * deux fois la même sous-page (copier-coller), et les deux doivent partir.
 *
 * Le document rendu est neuf quand quelque chose a bougé, et c'est EXACTEMENT
 * l'objet d'entrée sinon — l'appelant s'en sert pour décider s'il écrit.
 */
export function removeSubpages(
  doc: PageDocJSON | null | undefined,
  pageIds: Iterable<string>
): { doc: PageDocJSON | null | undefined; removed: number } {
  const targets = new Set(pageIds);
  if (!doc || targets.size === 0) return { doc, removed: 0 };

  let removed = 0;
  const prune = (nodes: PageNodeJSON[]): PageNodeJSON[] => {
    const out: PageNodeJSON[] = [];
    for (const node of nodes) {
      const id = pageIdOf(node);
      if (id && targets.has(id)) {
        removed += 1;
        continue;
      }
      const children = childrenOf(node);
      if (children.length === 0) {
        out.push(node);
        continue;
      }
      const next = prune(children);
      out.push(next === children ? node : { ...node, content: next });
    }
    return out.length === nodes.length && out.every((n, i) => n === nodes[i])
      ? nodes
      : out;
  };

  const content = prune(childrenOf(doc));
  if (removed === 0) return { doc, removed: 0 };
  return { doc: { ...doc, content }, removed };
}

/**
 * Réécrit les pages citées d'après une table `ancien id → nouvel id`.
 *
 * C'est ce qui rend une DUPLICATION honnête. Copier une page et ses sous-pages
 * en recopiant les corps tels quels donnerait une copie dont les blocs pointent
 * encore vers les ORIGINAUX : deux arbres dans la sidebar, un seul jeu de liens,
 * et une copie qu'on croit indépendante alors qu'elle renvoie ailleurs.
 *
 * Une citation HORS de la table n'est pas touchée — un lien vers une page du
 * projet qui ne fait pas partie de la copie doit continuer de pointer où il
 * pointait. On copie une branche, pas le monde autour.
 */
export function remapSubpages(
  doc: PageDocJSON | null | undefined,
  idMap: ReadonlyMap<string, string>
): PageDocJSON | null | undefined {
  if (!doc || idMap.size === 0) return doc;

  const walk = (nodes: PageNodeJSON[]): PageNodeJSON[] =>
    nodes.map((node) => {
      const id = pageIdOf(node);
      const next = id ? idMap.get(id) : undefined;
      const children = childrenOf(node);
      const content = children.length > 0 ? walk(children) : null;
      if (!next && !content) return node;
      return {
        ...node,
        ...(next ? { attrs: { ...node.attrs, pageId: next } } : {}),
        ...(content ? { content } : {}),
      };
    });

  return { ...doc, content: walk(childrenOf(doc)) };
}

/**
 * Remet un bloc sous-page à la FIN du document, s'il n'y est plus.
 *
 * En fin de corps, et pas à sa place d'origine : retenir la position exacte
 * demanderait de journaliser le voisinage du bloc au moment de la suppression,
 * pour un gain quasi nul — on restaure une page, pas une mise en page. C'est
 * l'hypothèse assumée du ticket.
 *
 * Sans `blockId` : c'est `UniqueID` qui en pose un au prochain montage de
 * l'éditeur. En inventer un ici demanderait un générateur d'aléatoire dans un
 * module pur, et deux clients pourraient en poser deux différents sur le même
 * bloc.
 */
export function appendSubpage(
  doc: PageDocJSON | null | undefined,
  pageId: string
): { doc: PageDocJSON; added: boolean } {
  const base: PageDocJSON = doc ?? { type: "doc", content: [] };
  if (hasSubpage(base, pageId)) return { doc: base, added: false };
  return {
    doc: {
      ...base,
      content: [
        ...childrenOf(base),
        { type: SUBPAGE_TYPE, attrs: { pageId } },
      ],
    },
    added: true,
  };
}
