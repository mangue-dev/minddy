/**
 * Catalogue des captures du site public (MIN-73).
 *
 * Chaque entrée est une commande de capture : quel écran ouvrir, dans quel état,
 * et dans quel rapport d'image l'afficher. Tant qu'aucune image n'est publiée
 * pour la variante demandée, le composant `<ScreenshotSlot>` rend un cadre de
 * réservation qui affiche la consigne — la mise en page est donc déjà juste,
 * seule l'image manque.
 *
 * Les captures sont produites par le dossier `captures/` (skills
 * `capture-world` pour les données, `capture-shot` pour les images), publiées
 * dans `public/captures/` sous le nom `<id>-<langue>-<thème>.webp`, et
 * recensées dans `screenshot-manifest.ts` par `node captures/lib/publish.mjs`.
 *
 * `src` ne sert plus qu'aux exceptions : une image posée à la main, hors de
 * cette chaîne. C'est un patron où `{theme}` et `{lang}` sont substitués.
 */
import { PUBLISHED_SCREENSHOTS } from "./screenshot-manifest";

export interface ScreenshotSlot {
  /** Clé stable, utilisée comme identifiant dans le code des sections. */
  id: string;
  /** Écran à capturer, en toutes lettres (chemin dans l'app). */
  route: string;
  /** État attendu à l'écran : ce qui doit être visible, et avec quelles données. */
  shot: string;
  /** Rapport d'image du cadre, en notation CSS `aspect-ratio`. */
  ratio: string;
  /**
   * Exception : patron d'URL d'une image posée à la main, hors de la chaîne
   * `captures/`. `null` = comportement normal, l'image vient du manifeste.
   */
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
  numoPanel: {
    id: "numoPanel",
    route: "n'importe quelle page de l'app, panneau Numo ouvert",
    shot:
      "Le panneau Numo ouvert sur la droite : une instruction de l'utilisateur, la réponse de Numo, et deux ou trois appels d'outils dépliés (recherche de tickets, mise à jour groupée). Le badge de contexte visible en haut (« Ticket en contexte »).",
    ratio: "4/3",
    src: null,
  },
  voiceDictate: {
    id: "voiceDictate",
    route: "/projects/<id>/issues/<identifier>, dictée en cours",
    shot:
      "Un ticket ouvert pendant un enregistrement : bouton micro actif, popover de dictée (chronomètre + forme d'onde) et les champs du ticket — priorité, échéance, assigné — visibles autour. On doit comprendre que la voix remplit ces champs-là, pas seulement la description.",
    ratio: "16/10",
    src: null,
  },
  scratchpad: {
    id: "scratchpad",
    route: "n'importe quelle page de l'app, carnet ouvert (G puis N)",
    shot:
      "La modale du carnet de tâches : deux sections « ## », des tâches cochées et d'autres à faire, et une action de section visible au survol (« Copier la section en prompt » ou « Lancer un agent »).",
    ratio: "4/3",
    src: null,
  },
  feedbackBoard: {
    id: "feedbackBoard",
    route: "/f/<token> — board public, visiteur déconnecté",
    shot:
      "Le board public trié par votes : une dizaine de retours avec leur compteur, des badges de statut (Prévu, En cours, Livré), une réponse d'équipe dépliée sur l'un d'eux, et les catégories en colonne latérale.",
    ratio: "16/10",
    src: null,
  },
  feedbackInbox: {
    id: "feedbackInbox",
    route: "/projects/<id>/feedback — vue interne",
    shot:
      "Un retour vu côté équipe : le texte soumis, ses votes, la bannière de suggestion de fusion par l'IA, et les actions « Promouvoir en ticket » et « Réponse d'équipe ».",
    ratio: "16/10",
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

/**
 * L'URL de la capture d'un emplacement, pour une langue et un thème donnés —
 * ou `null` s'il n'y en a pas, auquel cas le cadre de réservation s'affiche.
 *
 * La correspondance est EXACTE : une variante non publiée ne se rabat pas sur
 * une autre. Servir une capture française sur la page anglaise, ou une image
 * claire sur un fond sombre, se remarque plus qu'un cadre vide — et masquerait
 * le fait qu'il reste une capture à produire.
 */
export function screenshotSrc(
  slot: ScreenshotSlot,
  { theme, lang }: { theme: "light" | "dark"; lang: string },
): string | null {
  if (slot.src) {
    return slot.src.replaceAll("{theme}", theme).replaceAll("{lang}", lang);
  }
  const key = `${slot.id}-${lang}-${theme}`;
  return PUBLISHED_SCREENSHOTS.has(key) ? `/captures/${key}.webp` : null;
}
