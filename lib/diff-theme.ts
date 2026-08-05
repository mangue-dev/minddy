import type { LineDiffTypes, ThemesType } from "@pierre/diffs";

/**
 * Habillage de la vue diff (MIN-181) — ce qui, du thème de minddy, doit
 * traverser la frontière du Shadow DOM de `@pierre/diffs`.
 *
 * Deux moitiés, et elles ne vivent pas au même endroit :
 *
 * - **Les couleurs du CADRE** (fonds, aplats vert/rouge, numéros de ligne) sont
 *   des variables CSS `--diffs-*`, posées sur `.pr-diff-view` dans
 *   [app/globals.css](../app/globals.css). Les propriétés personnalisées
 *   TRAVERSENT la frontière d'ombre par héritage : la lib les lit dans son
 *   `:host` sans qu'on ait rien à injecter. Elles sont écrites là-bas, avec les
 *   autres jetons du dépôt, parce qu'elles s'expriment en `var(--card)`,
 *   `var(--foreground)`… — les mêmes que le reste de l'app.
 *
 * - **Les couleurs du CODE** (mots-clés, chaînes, commentaires) viennent d'un
 *   thème Shiki, choisi ici. Plus de palette maison : Shiki colore par
 *   grammaire TextMate, et un thème complet dit ce que la nôtre approximait.
 *
 * Reste `unsafeCSS`, la seule chose qu'on injecte VRAIMENT dans l'ombre : deux
 * règles de comportement, pas de décoration.
 */

/**
 * Le couple clair / sombre passé à `options.theme`. Les thèmes maison de Pierre
 * plutôt qu'un `github-*` : ils sont calibrés POUR ce rendu-là — les tokens y
 * restent lisibles posés sur les aplats vert et rouge du diff, ce qui est
 * exactement le problème qui nous faisait maintenir une palette à la main.
 *
 * `themeType` (`"light" | "dark"`), lui, se passe à part : il force le
 * `color-scheme` du `:host`, donc la branche que résolvent les dizaines de
 * `light-dark()` de la lib. Sans lui, elles suivraient la préférence de l'OS —
 * pas le thème choisi dans minddy.
 */
export const DIFF_THEMES: ThemesType = {
  light: "pierre-light",
  dark: "pierre-dark",
};

/**
 * Comment marquer, DANS une ligne modifiée, ce qui a réellement changé. Ça
 * compte autant que la coloration : sans ce marquage, une ligne retouchée d'un
 * caractère se présente comme entièrement réécrite, et l'oeil doit refaire la
 * comparaison lui-même.
 *
 * `word-alt` et pas `char` : sur du code (indentation, ponctuation), le découpage
 * caractère par caractère produit un confetti de surlignages qui dessert la
 * lecture.
 *
 * Comme `DIFF_THEMES`, ce réglage se passe à DEUX endroits — au composant et au
 * pool de workers, qui l'emporte quand il est là (cf. `PrDiffWorkers`). D'où la
 * constante : deux valeurs qui divergeraient donneraient deux rendus selon que
 * la coloration vient du worker ou du fil principal.
 */
export const DIFF_LINE_DIFF_TYPE: LineDiffTypes = "word-alt";

/**
 * CSS injecté dans le Shadow DOM (`options.unsafeCSS`). Deux règles, et les
 * deux disent où le « + » de commentaire n'a PAS le droit d'apparaître.
 *
 * 1. **Une ligne de contexte dépliée n'est pas dans le diff.** GitHub renvoie
 *    **422** (`line: could not be resolved`) sur un commentaire posé là —
 *    vérifié contre l'API. La lib distingue justement `context` (dans le patch)
 *    de `context-expanded` (ramenée par le dépliage) : la règle s'écrit donc en
 *    une ligne de CSS, là où elle demandait un ensemble de clés de changement
 *    recalculé à chaque rendu.
 *
 * 2. **En côte-à-côte, une ligne de contexte ne s'ancre qu'à DROITE.** Elle
 *    existe des deux côtés, mais commenter du contexte parle du code tel qu'il
 *    est APRÈS la PR — c'est le choix de GitHub, et celui qu'on tenait déjà.
 *    Offrir le « + » dans la gouttière de gauche produirait un `side: LEFT` sur
 *    une ligne inchangée : accepté par la forge, mais pas ce que la personne
 *    croit désigner.
 *
 * Le clic est refusé une seconde fois côté JS (`commentAnchor`) : le CSS cache
 * l'affordance, il ne garantit pas la règle — un glissement de sélection peut
 * finir sur une ligne dépliée sans jamais y avoir survolé la gouttière.
 */
/**
 * Attribut posé par `pr-diff` sur les lignes couvertes par une remarque
 * MULTI-LIGNES. Il vit ici avec la règle CSS qui le peint : les deux moitiés
 * n'ont de sens qu'ensemble.
 */
export const DIFF_RANGE_ATTRIBUTE = "data-pr-comment-range";

export const DIFF_UNSAFE_CSS = `
[data-line-type="context-expanded"] [data-gutter-utility-slot] { display: none; }
[data-deletions] [data-line-type="context"] [data-gutter-utility-slot] { display: none; }

/* Les lignes qu'une remarque multi-lignes couvre.
   On ne pose PAS un fond : on remonte la variable dont la lib dérive le fond de
   chaque ligne. Elle mélange par-dessus \`--diffs-computed-diff-line-bg\`, donc le
   vert d'un ajout et le rouge d'un retrait restent lisibles sous la teinte —
   là où un \`background-color\` les aurait effacés. Même chaîne, mêmes
   proportions que la sélection de la lib, en un ton plus discret : une plage
   commentée est un état durable, pas un geste en cours. */
[${DIFF_RANGE_ATTRIBUTE}] {
  --diffs-computed-selected-line-bg: light-dark(
    color-mix(in lab, var(--diffs-computed-diff-line-bg) 90%, var(--diffs-selection-base)),
    color-mix(in lab, var(--diffs-computed-diff-line-bg) 85%, var(--diffs-selection-base)));
}
/* La gouttière porte le trait vertical qui donne à la plage ses deux bouts —
   c'est lui, plus que la teinte, qui se voit sans qu'on ait à lire. */
[data-column-number][${DIFF_RANGE_ATTRIBUTE}] {
  --diffs-computed-selected-line-bg: light-dark(
    color-mix(in lab, var(--diffs-computed-diff-line-bg) 82%, var(--diffs-selection-base)),
    color-mix(in lab, var(--diffs-computed-diff-line-bg) 74%, var(--diffs-selection-base)));
  box-shadow: inset 2px 0 0 var(--diffs-selection-base);
  color: var(--diffs-selection-number-fg);
}
`;
