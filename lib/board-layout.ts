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
