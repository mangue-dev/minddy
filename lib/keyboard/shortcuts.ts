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
  labelKey: string;
  keys: string[][];
}

export interface CheatsheetSection {
  id: string;
  /** i18n key under `Keyboard.sections`. */
  titleKey: string;
  shortcuts: CheatsheetShortcut[];
}

export const CHEATSHEET: CheatsheetSection[] = [
  {
    id: "navigation",
    titleKey: "navigation",
    shortcuts: [
      { id: "nav.home", labelKey: "navHome", keys: [["G"], ["H"]] },
      { id: "nav.inbox", labelKey: "navInbox", keys: [["G"], ["I"]] },
      { id: "nav.assistant", labelKey: "navAssistant", keys: [["G"], ["A"]] },
      { id: "nav.allIssues", labelKey: "navAllIssues", keys: [["G"], ["B"]] },
      { id: "nav.myIssues", labelKey: "navMyIssues", keys: [["G"], ["M"]] },
      { id: "nav.objectives", labelKey: "navObjectives", keys: [["G"], ["O"]] },
      { id: "nav.triage", labelKey: "navTriage", keys: [["G"], ["T"]] },
      {
        id: "nav.projectSettings",
        labelKey: "navProjectSettings",
        keys: [["G"], ["S"]],
      },
    ],
  },
  {
    id: "general",
    titleKey: "general",
    shortcuts: [
      { id: "gen.palette", labelKey: "palette", keys: [["mod", "K"]] },
      { id: "gen.search", labelKey: "search", keys: [["F"]] },
      { id: "gen.toggleSidebar", labelKey: "toggleSidebar", keys: [["mod", "B"]] },
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
      { id: "card.copyPrompt", labelKey: "copyPrompt", keys: [["⇧", "P"]] },
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
