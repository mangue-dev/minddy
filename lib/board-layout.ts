/**
 * La largeur d'une colonne de board, et pourquoi elle n'est pas `w-full` sous
 * 1200 px (MIN-293).
 *
 * Le board était un empilement de colonnes PLEINE LARGEUR qu'on feuilletait au
 * doigt, une par écran. C'est juste sur un téléphone ; ça ne l'est plus dès
 * qu'on redimensionne la fenêtre de l'app de bureau, où la même règle donnait
 * une colonne unique de 900 px de large — une carte de ticket étirée sur toute
 * la fenêtre, et cinq statuts hors champ.
 *
 * D'où un partage : la colonne prend une FRACTION de la place, et la fraction
 * suit la place disponible.
 *
 *     < 640 px   1 colonne   (téléphone : le feuilletage d'origine)
 *     ≥ 640 px   2 colonnes
 *     ≥ 1024 px  3 colonnes
 *     ≥ 1200 px  22rem fixes (le board complet, avec sa barre latérale)
 *
 * Le calcul retire les gouttières AVANT de diviser (`gap-3` = 0.75rem entre deux
 * colonnes) : sans ça, deux colonnes à 50 % plus une gouttière débordent, et la
 * deuxième est coupée à droite — ce qui a exactement l'air d'un bug d'une
 * colonne mal calée.
 *
 * L'accroche du défilement passe de `snap-center` à `snap-start` : centrer avait
 * du sens quand une colonne remplissait l'écran (centre = début) ; avec deux ou
 * trois colonnes visibles, ça les laisserait à cheval sur les deux bords. Le
 * même changement ne change rien à un doigt sur un téléphone.
 */
export const BOARD_COLUMN_CLASS =
  "w-full shrink-0 snap-start sm:w-[calc((100%-0.75rem)/2)] lg:w-[calc((100%-1.5rem)/3)] desktop:w-[22rem]";

/**
 * La gouttière du défileur.
 *
 * Elle valait 16 px en compact contre 24 en large. C'est-à-dire que le seul cas
 * où la barre latérale ne pousse plus le board vers l'intérieur était aussi
 * celui qui lui donnait le moins de marge : la colonne de gauche démarrait au
 * bord de la fenêtre. Elle passe donc à 24 px dès qu'il y a plus d'une colonne,
 * c'est-à-dire dès `sm` — même chiffre partout, sauf sur un téléphone où 24 px
 * de chaque côté seraient pris sur la carte.
 *
 * ⚠ **Le fondu de bord ne se règle plus ici** (MIN-319). Il passait par un
 * `mask-image` posé SUR ce défileur, avec une rampe en variable CSS
 * (`--board-fade`) que cette classe éteignait sous 640 px. Un masque sur un
 * conteneur qui défile le fait re-compositer à chaque image — et c'était ici un
 * masque à l'intérieur d'un masque, chaque colonne en portant un aussi. Le
 * fondu est désormais un calque dessiné À CÔTÉ du défileur
 * (`components/scroll-fade-edges.tsx`), piloté par les `edges` que rend
 * `useScrollFade` : rien n'est posé sur le contenu, donc rien à re-compositer.
 */
export const BOARD_SCROLLER_CLASS =
  "flex gap-3 overflow-x-auto px-4 snap-x snap-mandatory sm:px-6 desktop:snap-none";
