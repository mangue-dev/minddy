/**
 * Catalogue des captures du site public (MIN-73).
 *
 * Chaque entrée est une commande de capture : quel écran ouvrir, dans quel état,
 * et dans quel rapport d'image l'afficher. Tant que `src` vaut `null`, le
 * composant `<ScreenshotSlot>` rend un cadre de réservation qui affiche la
 * consigne — la mise en page est donc déjà juste, seule l'image manque.
 *
 * Pour brancher les vraies captures (produites par AutoKap) : renseigner `src`.
 * `src` est un patron où `{theme}` et `{lang}` sont substitués à l'affichage, ce
 * qui permet de servir la bonne variante clair/sombre et FR/EN depuis un même
 * endpoint — par exemple
 * `"/api/autokap/assets/<id>?theme={theme}&lang={lang}&w=1600&format=webp"`.
 */

export interface ScreenshotSlot {
  /** Clé stable, utilisée comme identifiant dans le code des sections. */
  id: string;
  /** Écran à capturer, en toutes lettres (chemin dans l'app). */
  route: string;
  /** État attendu à l'écran : ce qui doit être visible, et avec quelles données. */
  shot: string;
  /** Rapport d'image du cadre, en notation CSS `aspect-ratio`. */
  ratio: string;
  /** Patron d'URL de la capture. `null` = pas encore produite. */
  src: string | null;
}

const SLOTS = {
  heroBoard: {
    id: "heroBoard",
    route: "/projects/<id>/board",
    shot:
      "Le board d'un projet, vue liste groupée par statut. Une dizaine d'issues aux titres crédibles, priorités et efforts variés, deux ou trois assignés avec avatar, une issue « in_progress » portant un badge d'agent. Sidebar visible, pas de modale ouverte.",
    ratio: "16/10",
    src: null,
  },
  workflowIssue: {
    id: "workflowIssue",
    route: "/projects/<id>/issues/<identifier>",
    shot:
      "Le détail d'une issue avec sa description ET son plan d'implémentation visible : quelques tâches cochées, une en cours, le reste à faire. C'est l'écran qui montre que le plan est une vraie donnée, pas un commentaire.",
    ratio: "4/3",
    src: null,
  },
  workflowAgent: {
    id: "workflowAgent",
    route: "/agents",
    shot:
      "Un run d'agent en cours : fil d'exécution avec appels d'outils (lecture de fichiers, édition), statut « en cours », et l'issue rattachée en en-tête.",
    ratio: "4/3",
    src: null,
  },
  workflowPr: {
    id: "workflowPr",
    route: "/pull-requests",
    shot:
      "La vue Pull Request d'une issue : en-tête branche → branche, description générée, et un diff par fichier avec ajouts/suppressions colorés.",
    ratio: "4/3",
    src: null,
  },
  featureCycle: {
    id: "featureCycle",
    route: "/home (bloc cycle) ou la page cycle",
    shot:
      "La quinzaine en cours : issues de plusieurs projets dans une même liste, progression visible. Montre l'aspect transverse du cycle.",
    ratio: "16/10",
    src: null,
  },
  featurePalette: {
    id: "featurePalette",
    route: "n'importe quelle page de l'app, palette ouverte",
    shot:
      "La palette ⌘K ouverte, une recherche tapée qui remonte des issues et des actions, raccourcis clavier affichés à droite des lignes.",
    ratio: "16/10",
    src: null,
  },
} as const satisfies Record<string, ScreenshotSlot>;

export type ScreenshotSlotId = keyof typeof SLOTS;

export const SCREENSHOT_SLOTS: Record<ScreenshotSlotId, ScreenshotSlot> = SLOTS;

/** Résout le patron `src` d'un emplacement pour un thème et une langue donnés. */
export function screenshotSrc(
  slot: ScreenshotSlot,
  { theme, lang }: { theme: "light" | "dark"; lang: string },
): string | null {
  if (!slot.src) return null;
  return slot.src.replaceAll("{theme}", theme).replaceAll("{lang}", lang);
}
