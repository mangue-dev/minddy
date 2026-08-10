/**
 * Le GLISSER-DÉPOSER de l'arbre des pages (MIN-270), en logique pure.
 *
 * Une ligne survolée offre trois cibles, et pas une de plus : au-dessus d'elle,
 * en dessous d'elle, ou DEDANS. C'est la grammaire de Notion, et c'est la seule
 * qui permette de réordonner et de reparenter avec le même geste — un arbre où
 * le déplacement ne fait que réordonner oblige à un second geste (« déplacer
 * vers… ») pour ce qui est l'action la plus fréquente.
 *
 * Rien ici ne touche au réseau : la fonction rend le couple `parent_id` /
 * `position` que le PATCH enverra, ou `null` quand le geste n'a pas de sens.
 * `null` n'est pas une erreur — c'est ce qui empêche l'indicateur de dépôt de
 * s'allumer sous le curseur, avant même qu'un clic ne parte au serveur.
 *
 * La garde de CYCLE est rejouée ici, alors que le serveur la porte déjà : sans
 * elle, on laisserait l'utilisateur lâcher une page dans sa propre descendance
 * pour lui répondre par un toast d'échec une demi-seconde plus tard. Le serveur
 * reste l'autorité (un autre onglet a pu déplacer la page entre-temps) ; celle-ci
 * n'est là que pour ne pas proposer un geste dont on sait qu'il sera refusé.
 */

import {
  byPosition,
  positionBetween,
  wouldCreateCycle,
  type PageRow,
} from "./pages";

/** Où la page tombe par rapport à la ligne survolée. */
export type PageDropMode = "before" | "after" | "inside";

export interface PageMove {
  parent_id: string | null;
  position: string;
}

/**
 * Le tiers HAUT d'une ligne dépose avant, le tiers BAS dépose après, le milieu
 * dépose dedans. Un tiers et pas un quart : la zone « dedans » est celle qui
 * change la structure, et c'est aussi la plus difficile à viser — lui donner
 * plus de place qu'aux deux autres la rendrait au contraire trop facile à
 * déclencher par accident en cherchant à réordonner.
 */
export function dropModeAt(offsetY: number, height: number): PageDropMode {
  if (height <= 0) return "inside";
  const ratio = offsetY / height;
  if (ratio < 1 / 3) return "before";
  if (ratio > 2 / 3) return "after";
  return "inside";
}

/**
 * Le déplacement à écrire, ou `null` si le geste n'a pas de sens : lâcher une
 * page sur elle-même, ou la lâcher dans sa propre descendance.
 *
 * `pages` est la liste À PLAT, telle qu'elle est en cache : la fratrie visée en
 * est extraite et triée ici, la page déplacée retirée du compte — sinon
 * « déposer après mon voisin du dessous » calculerait une position entre lui et
 * moi, c'est-à-dire au même endroit qu'avant.
 */
export function computePageMove(
  pages: readonly PageRow[],
  dragId: string,
  targetId: string,
  mode: PageDropMode
): PageMove | null {
  if (dragId === targetId) return null;

  const target = pages.find((page) => page.id === targetId);
  if (!target) return null;

  const parentId = mode === "inside" ? target.id : target.parent_id;
  if (wouldCreateCycle(pages, dragId, parentId)) return null;

  const siblings = pages
    .filter(
      (page) => page.id !== dragId && (page.parent_id ?? null) === parentId
    )
    .sort(byPosition);

  if (mode === "inside") {
    // En FIN des sous-pages : c'est là qu'on lit une page qu'on vient de
    // ranger, et c'est aussi ce que fait la création d'une sous-page.
    const last = siblings[siblings.length - 1];
    return { parent_id: parentId, position: positionBetween(last?.position, null) };
  }

  const index = siblings.findIndex((page) => page.id === targetId);
  if (index === -1) {
    // La cible n'est plus dans sa propre fratrie (cache décalé) : on tombe en
    // fin de liste plutôt que de refuser un geste que l'utilisateur a fait.
    const last = siblings[siblings.length - 1];
    return { parent_id: parentId, position: positionBetween(last?.position, null) };
  }

  const before = mode === "before" ? siblings[index - 1] : siblings[index];
  const after = mode === "before" ? siblings[index] : siblings[index + 1];
  return {
    parent_id: parentId,
    position: positionBetween(before?.position, after?.position),
  };
}
