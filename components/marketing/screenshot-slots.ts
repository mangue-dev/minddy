import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Public site capture catalog (MIN-73).
 *
 * Each entry is a capture command: which screen to open, in what state,
 * and in what aspect ratio to display it. As long as no image is published
 * for the requested variant, the `<ScreenshotSlot>` component renders a reservation frame which displays the instruction — the layout is therefore already correct,
 * only the image is missing.
 *
 * **A instruction from here is not not a truth about the product.** Five of the eleven
 * original entries described a UI that does not exist: a detail
 * exit route (it's a side panel), a "description AND plan" view that the
 * tabs make exclusive, "unfolded" tool calls that do not se
 * not unfolding, an unreachable context badge, an absent team response
 * from the public board. Read the target screen before capturing, and correct the intention
 * rather than the product — each `captures/shots/<nom>/intent.md` says which one.
 *
 * `voiceDictate` has been REMOVED: the dictation is not photographable (the popover
 * only exists after a successful `getUserMedia`) and, above all, a capture would show
 * that we save instead of showing what the said sentence becomes. The
 * section makes `<VoiceDictationFigure>`, a figure, instead.
 *
 * Captures are produced by the `captures/` folder (skills
 * `capture-world` for data, `capture-shot` for images), published
 * in `public/captures/` under the name `<id>-<locale>-<theme>.webp`, and
 * listed in `screenshot-manifest.ts` by `node captures/lib/publish.mjs`.
 *
 * `src` is only used for exceptions: an image placed by hand, outside
 * this chain. This is a pattern where `{theme}` and `{lang}` are substituted.
 */
import { PUBLISHED_SCREENSHOTS } from "./screenshot-manifest";

export interface ScreenshotSlot {
  /** Stable key, used as an identifier in the section code. */
  id: string;
  /** Screen to capture, in full (path in the app). */
  route: string;
  /** Expected state on the screen: what should be visible, and with what data. */
  shot: string;
  /**
 * i18n key for the alternative text of the image (namespace `Landing`).
 *
 * It was `shot` which served as `alt`: three hundred character instructions for
 * PRODUCTION (“Sidebar visible, not of open modal"), in French whatever
 * whatever the language of the page. A `alt` describes what you see to someone
 * who doesn't see it — not what you had to do to photograph it.
 */
  altKey: MessageKey<"Landing">;
  /** Rapport d'image du cadre, en notation CSS `aspect-ratio`. */
  ratio: string;
  /**
 * Exception: URL pattern of a hand-placed image, outside the chain
 * `captures/`. `null` = normal behavior, the image comes from the manifest.
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
  // NO SECTION PLACES IT since MIN-148: the tracker section, which has become a
  // reassurance time, shows the board rather than the cycle. The location
  // stays here, and its capture published with it — the `captures/` chain knows it
  // produce (`captures/shots/cycle/`), and the page that needs it will not have
  // nothing to do again.
  featureCycle: {
    id: "featureCycle",
    route: "/home (bloc cycle) ou la page cycle",
    shot:
      "La quinzaine en cours : issues de plusieurs projets dans une même liste, progression visible. Montre l'aspect transverse du cycle.",
    altKey: "shotAlt_featureCycle",
    ratio: "16/10",
    src: null,
  },
  pagesEditor: {
    id: "pagesEditor",
    route: "/projects/<id>/pages/<pageId>",
    shot:
      "Une page du wiki ouverte : à gauche l'arbre des pages du projet avec une page dépliée sur ses sous-pages, à droite le contenu — un titre, un paragraphe, une liste de cases à cocher dont deux cochées, et une pilule de mention vers un ticket dans le texte. Pas de menu ouvert : c'est la page telle qu'on la lit, pas l'éditeur en train d'être manipulé.",
    altKey: "shotAlt_pagesEditor",
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
 * The URL to capture a location, for a given language and theme —
 * or `null` if there is none, in which case the placeholder is displayed.
 *
 * The match is EXACT: an unpublished variant does not collapse on
 * another. Serving a French capture on the English page, or a clear image
 * on a dark background, is more noticeable than an empty frame — and would hide
 * the fact that there is still a capture to be produced.
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
