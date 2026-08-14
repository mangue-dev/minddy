/**
 * La PROFONDEUR d'une valeur JSON, mesurée sans récursion (MIN-348).
 *
 * Le garde-fou de taille d'un corps de page était `JSON.stringify(value).length`
 * — et c'est le garde-fou lui-même qui tombait le premier : `JSON.stringify`
 * descend l'arbre par la pile d'appels, donc un document de quelques kilo-octets
 * mais imbriqué dix mille fois lève un `RangeError` AVANT d'avoir pu être pesé.
 * La borne à poser en premier n'est donc pas la taille, c'est la profondeur, et
 * elle doit se mesurer autrement que par une descente récursive.
 *
 * D'où une pile EXPLICITE. Elle a un second effet, gratuit : un objet cyclique
 * (que `JSON.stringify` refuse, mais après coup) fait croître la profondeur sans
 * fin, donc sort par le plafond au lieu de tourner en rond.
 *
 * Module pur, sans `server-only` : la même borne sert au client le jour où il
 * veut refuser avant d'envoyer.
 */

/**
 * Le plafond d'un corps de page ProseMirror.
 *
 * Large exprès : une liste à puces imbriquée dix fois pèse déjà une trentaine de
 * niveaux (doc → liste → item → paragraphe, par cran), et une citation dans un
 * tableau dans une liste en ajoute autant. Cent niveaux, c'est au-delà de tout
 * document qu'un éditeur rend — mais très en deçà de ce qui casse une pile.
 */
export const MAX_PAGE_JSON_DEPTH = 100;

/**
 * `true` dès que `value` dépasse `max` niveaux d'imbrication.
 *
 * S'arrête à la première branche fautive : sur une entrée hostile, le coût est
 * celui de la descente jusqu'au plafond, pas celui de l'arbre entier.
 */
export function exceedsJsonDepth(value: unknown, max: number): boolean {
  // [valeur, profondeur de la valeur]. La racine est au niveau 1.
  const stack: [unknown, number][] = [[value, 1]];

  while (stack.length > 0) {
    const [node, depth] = stack.pop()!;
    if (node === null || typeof node !== "object") continue;
    if (depth > max) return true;

    if (Array.isArray(node)) {
      for (const item of node) stack.push([item, depth + 1]);
    } else {
      for (const item of Object.values(node)) stack.push([item, depth + 1]);
    }
  }
  return false;
}
