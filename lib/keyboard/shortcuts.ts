import type { MessageKey } from "@/lib/i18n-keys";

// Single source of truth for the keyboard cheat sheet. Each shortcut carries an
// i18n label key (under "Keyboard.shortcuts") and the keys to render.
//
// `keys` is a list of chord steps. Each step is a group of tokens shown together
// (a combo like ⌘+B → ["mod", "B"]); successive steps render with a "then"
// separator (a sequence like G then A → [["G"], ["A"]]). The token "mod" is
// resolved to ⌘ / Ctrl per platform at render time (see keyboard-cheatsheet).

export interface CheatsheetShortcut {
  id: string;
  /** i18n key under `Keyboard.shortcuts`. */
  labelKey: MessageKey<"Keyboard.shortcuts">;
  keys: string[][];
  /** Combinaison ÉQUIVALENTE (pas une suite) — rendue après un « / ». */
  altKeys?: string[][];
}

export interface CheatsheetSection {
  id: string;
  /** i18n key under `Keyboard.sections`. */
  titleKey: MessageKey<"Keyboard.sections">;
  shortcuts: CheatsheetShortcut[];
}

export const CHEATSHEET: CheatsheetSection[] = [
  {
    id: "navigation",
    titleKey: "navigation",
    shortcuts: [
      { id: "nav.home", labelKey: "navHome", keys: [["G"], ["H"]] },
      { id: "nav.inbox", labelKey: "navInbox", keys: [["G"], ["I"]] },
      {
        id: "nav.pullRequests",
        labelKey: "navPullRequests",
        keys: [["G"], ["R"]],
      },
      { id: "nav.agents", labelKey: "navAgents", keys: [["G"], ["J"]] },
      { id: "nav.assistant", labelKey: "navAssistant", keys: [["G"], ["A"]] },
      { id: "nav.notes", labelKey: "navNotes", keys: [["G"], ["N"]] },
      { id: "nav.allIssues", labelKey: "navAllIssues", keys: [["G"], ["B"]] },
      { id: "nav.myIssues", labelKey: "navMyIssues", keys: [["G"], ["M"]] },
    ],
  },
  {
    // Ces chords ne sont routés que depuis un projet (keyboard-context runChord).
    id: "project",
    titleKey: "project",
    shortcuts: [
      {
        id: "nav.projectBoard",
        labelKey: "navProjectBoard",
        keys: [["G"], ["P"]],
      },
      { id: "nav.objectives", labelKey: "navObjectives", keys: [["G"], ["O"]] },
      { id: "nav.triage", labelKey: "navTriage", keys: [["G"], ["T"]] },
      { id: "nav.feedback", labelKey: "navFeedback", keys: [["G"], ["F"]] },
      {
        id: "nav.projectSettings",
        labelKey: "navProjectSettings",
        keys: [["G"], ["S"]],
      },
      // Le seul de la section qui ne soit pas un chord : il ne vaut que sur la
      // page Objectifs, un objectif ouvert, et le bouton le porte déjà en clair.
      {
        id: "nav.objectiveIssues",
        labelKey: "navObjectiveIssues",
        keys: [["mod", "O"]],
      },
    ],
  },
  {
    id: "general",
    titleKey: "general",
    shortcuts: [
      {
        id: "gen.palette",
        labelKey: "palette",
        keys: [["mod", "K"]],
        altKeys: [["mod", "P"]],
      },
      { id: "gen.search", labelKey: "search", keys: [["F"]] },
      // Le filtre de la colonne de gauche, sur les écrans qui en ont une
      // (triage, retours, pull requests, sessions, réglages). Il RÉDUIT la liste
      // affichée — la palette, elle, cherche partout et emmène ailleurs.
      { id: "gen.filterList", labelKey: "filterList", keys: [["/"]] },
      { id: "gen.undo", labelKey: "undo", keys: [["mod", "Z"]] },
      { id: "gen.redo", labelKey: "redo", keys: [["mod", "⇧", "Z"]] },
      { id: "gen.cheatsheet", labelKey: "cheatsheet", keys: [["?"]] },
    ],
  },
  {
    id: "create",
    titleKey: "create",
    shortcuts: [
      { id: "create.issue", labelKey: "createIssue", keys: [["C"]] },
      { id: "create.objective", labelKey: "createObjective", keys: [["O"]] },
      // Le texte fantôme du formulaire de ticket. Il n'a rien de global — c'est
      // Tab, dans le champ, quand un gris est à l'écran — mais il n'existe que
      // s'il se voit : personne ne devine une touche qu'on n'a jamais annoncée.
      { id: "create.completion", labelKey: "acceptCompletion", keys: [["⇥"]] },
    ],
  },
  {
    id: "card",
    titleKey: "card",
    shortcuts: [
      { id: "card.open", labelKey: "openIssue", keys: [["Space"]] },
      { id: "card.status", labelKey: "status", keys: [["S"]] },
      { id: "card.priority", labelKey: "priority", keys: [["P"]] },
      { id: "card.effort", labelKey: "effort", keys: [["E"]] },
      { id: "card.assignee", labelKey: "assignee", keys: [["A"]] },
      { id: "card.labels", labelKey: "labels", keys: [["L"]] },
      { id: "card.dueDate", labelKey: "dueDate", keys: [["D"]] },
      { id: "card.objective", labelKey: "objective", keys: [["O"]] },
      // Le seul raccourci de la section qui accepte AUSSI la sélection multiple :
      // quand la pilule est là, « @ » parle des tickets cochés (MIN-105).
      { id: "card.askNumo", labelKey: "askNumo", keys: [["@"]] },
      { id: "card.copyPrompt", labelKey: "copyPrompt", keys: [["⇧", "P"]] },
      { id: "card.launchAgent", labelKey: "launchAgent", keys: [["⇧", "A"]] },
      // Monté partout où DictateButton porte le raccourci : panneau du ticket
      // et dialog « nouveau ticket ». Il lui faut ⌘ : un combo ⇧ seul se
      // déclenchait sur une majuscule tapée dans le titre ou la description.
      { id: "card.dictate", labelKey: "dictate", keys: [["mod", "⇧", "D"]] },
    ],
  },
];

/** Resolve the `mod` token to the platform modifier symbol. */
export function resolveKeyToken(token: string): string {
  if (token !== "mod") return token;
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
  return isMac ? "⌘" : "Ctrl";
}

/**
 * Le même raccourci, mais tel qu'on l'ÉCRIT DANS UNE PHRASE — « ⌘K » sur un
 * Mac, « Ctrl+K » ailleurs. `KbdSequence` rend des touches côte à côte ; une
 * marche à suivre ou un toast, eux, ont besoin d'une chaîne, et le « + » que le
 * monde Windows attend entre les deux ne se devine pas d'un tableau de tokens.
 *
 * À n'appeler que côté client (`navigator`) : au rendu serveur il n'y a pas de
 * plateforme à lire, et la phrase dirait « Ctrl » à un utilisateur de Mac. Pour
 * une phrase RENDUE (par opposition à un toast déclenché par un geste), passer
 * par `useModShortcut`, qui gère l'hydratation.
 */
export function formatModShortcut(key: string): string {
  const mod = resolveKeyToken("mod");
  return mod === "⌘" ? `⌘${key}` : `${mod}+${key}`;
}
