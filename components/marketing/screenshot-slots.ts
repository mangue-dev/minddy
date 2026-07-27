/**
 * Catalogue des captures du site public (MIN-73).
 *
 * Chaque entrée est une commande de capture : quel écran ouvrir, dans quel état,
 * et dans quel rapport d'image l'afficher. Tant qu'aucune image n'est publiée
 * pour la variante demandée, le composant `<ScreenshotSlot>` rend un cadre de
 * réservation qui affiche la consigne — la mise en page est donc déjà juste,
 * seule l'image manque.
 *
 * **Une consigne d'ici n'est pas une vérité sur le produit.** Cinq des onze
 * entrées d'origine décrivaient une UI qui n'existe pas : une route de détail
 * d'issue (c'est un panneau latéral), une vue « description ET plan » que des
 * onglets rendent exclusives, des appels d'outils « dépliés » qui ne se
 * déplient pas, un badge de contexte inatteignable, une réponse d'équipe absente
 * du board public. Lire l'écran visé avant de capturer, et corriger l'intention
 * plutôt que le produit — chaque `captures/shots/<nom>/intent.md` dit laquelle.
 *
 * `voiceDictate` a été RETIRÉ : la dictée n'est pas photographiable (le popover
 * n'existe qu'après un `getUserMedia` réussi) et, surtout, une capture montrerait
 * qu'on enregistre au lieu de montrer ce que la phrase dite devient. La section
 * rend `<VoiceDictationFigure>`, une figure, à la place.
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
  /**
   * Clé i18n du texte alternatif de l'image (namespace `Landing`).
   *
   * C'est `shot` qui servait d'`alt` : trois cents caractères de consigne de
   * PRODUCTION (« Sidebar visible, pas de modale ouverte »), en français quelle
   * que soit la langue de la page. Un `alt` décrit ce qu'on voit à quelqu'un
   * qui ne le voit pas — pas ce qu'il fallait faire pour le photographier.
   */
  altKey: string;
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
    altKey: "shotAlt_heroBoard",
    ratio: "16/10",
    src: null,
  },
  workflowIssue: {
    id: "workflowIssue",
    route: "/projects/<id>, modale de création ouverte (c)",
    shot:
      "La modale « Nouveau ticket » sur le board : un titre, une description de deux phrases, et trois propriétés posées — priorité haute, effort M, catégorie Feature. Le bouton de création est actif. C'est le geste de l'utilisateur, et rien d'autre : le premier temps de la section s'appelle « Vous décrivez ».",
    altKey: "shotAlt_workflowIssue",
    ratio: "4/3",
    src: null,
  },
  workflowAgent: {
    id: "workflowAgent",
    route: "/agents",
    shot:
      "Un run d'agent en cours : fil d'exécution avec appels d'outils (lecture de fichiers, édition), statut « en cours », et l'issue rattachée en en-tête.",
    altKey: "shotAlt_workflowAgent",
    ratio: "4/3",
    src: null,
  },
  workflowPr: {
    id: "workflowPr",
    route: "/pull-requests",
    shot:
      "La page Pull requests : à gauche la liste des PR de l'agent Numo, à droite le détail : en-tête ticket + badge d'état + lien « PR #n », barre d'actions (Accepter / Refuser / Demander des changements), onglet « Fichiers modifiés » ouvert sur un diff par fichier avec ajouts/suppressions colorés. L'onglet est à basculer à la main : le détail s'ouvre sur « Conversation ».",
    altKey: "shotAlt_workflowPr",
    ratio: "4/3",
    src: null,
  },
  numoPanel: {
    id: "numoPanel",
    route: "/projects/<id>, panneau Numo ouvert par G puis A, passé en mode étendu",
    shot:
      "Le panneau Numo ouvert en mode étendu par-dessus le board : l'instruction de l'utilisateur, les réponses de Numo, et entre elles les deux lignes d'action qu'il a menées (« 3 tickets trouvés », puis « 2 tickets modifiés »), ces lignes ne se déplient pas, c'est leur état complet. Le badge de contexte dans le composeur, qui porte le nom de la vue affichée.",
    altKey: "shotAlt_numoPanel",
    ratio: "4/3",
    src: null,
  },
  scratchpad: {
    id: "scratchpad",
    route: "n'importe quelle page de l'app, carnet ouvert (G puis N)",
    shot:
      "La modale du carnet de tâches : deux sections « ## », des tâches cochées et d'autres à faire, et une action de section visible au survol (« Copier la section en prompt » ou « Lancer un agent »).",
    altKey: "shotAlt_scratchpad",
    ratio: "4/3",
    src: null,
  },
  feedbackBoard: {
    id: "feedbackBoard",
    route: "/f/<token>, board public, visiteur déconnecté",
    shot:
      "Le board public trié par votes : une dizaine de retours avec leur compteur, des badges de statut (Prévu, En cours, Livré), une réponse d'équipe dépliée sur l'un d'eux, et les catégories en colonne latérale.",
    altKey: "shotAlt_feedbackBoard",
    ratio: "16/10",
    src: null,
  },
  feedbackInbox: {
    id: "feedbackInbox",
    route: "/projects/<id>/feedback, vue interne",
    shot:
      "Un retour vu côté équipe : le texte soumis, ses votes, la bannière de suggestion de fusion par l'IA, et les actions « Promouvoir en ticket » et « Réponse d'équipe ».",
    altKey: "shotAlt_feedbackInbox",
    ratio: "16/10",
    src: null,
  },
  featureCycle: {
    id: "featureCycle",
    route: "/home (bloc cycle) ou la page cycle",
    shot:
      "La quinzaine en cours : issues de plusieurs projets dans une même liste, progression visible. Montre l'aspect transverse du cycle.",
    altKey: "shotAlt_featureCycle",
    ratio: "16/10",
    src: null,
  },
  featurePalette: {
    id: "featurePalette",
    route: "n'importe quelle page de l'app, palette ouverte",
    shot:
      "La palette ⌘K ouverte, une recherche tapée qui remonte des issues et des actions, raccourcis clavier affichés à droite des lignes.",
    altKey: "shotAlt_featurePalette",
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
