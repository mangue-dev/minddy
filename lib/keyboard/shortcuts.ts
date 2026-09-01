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
  /** EQUIVALENT combination (not a sequence) — rendered after a “/”. */
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
      { id: "nav.routines", labelKey: "navRoutines", keys: [["G"], ["U"]] },
      { id: "nav.assistant", labelKey: "navAssistant", keys: [["G"], ["A"]] },
      { id: "nav.notes", labelKey: "navNotes", keys: [["G"], ["N"]] },
      { id: "nav.allIssues", labelKey: "navAllIssues", keys: [["G"], ["B"]] },
      { id: "nav.myIssues", labelKey: "navMyIssues", keys: [["G"], ["M"]] },
    ],
  },
  {
    // These chords are only routed from a project (keyboard-context runChord).
    id: "project",
    titleKey: "project",
    shortcuts: [
      {
        id: "nav.projectBoard",
        labelKey: "navProjectBoard",
        keys: [["G"], ["P"]],
      },
      { id: "nav.objectives", labelKey: "navObjectives", keys: [["G"], ["O"]] },
      { id: "nav.pages", labelKey: "navPages", keys: [["G"], ["W"]] },
      { id: "nav.triage", labelKey: "navTriage", keys: [["G"], ["T"]] },
      { id: "nav.feedback", labelKey: "navFeedback", keys: [["G"], ["F"]] },
      {
        id: "nav.projectSettings",
        labelKey: "navProjectSettings",
        keys: [["G"], ["S"]],
      },
      // The only one in the section that is not a chord: it only applies to the
      // Objectives page, an open objective, and the button already has it in plain text.
      {
        id: "nav.objectiveIssues",
        labelKey: "navObjectiveIssues",
        keys: [["mod", "O"]],
      },
      // Same case: not a chord, and it is only valid on an open page — the
      // menu ⋯ of the page displays it too, next to the entry it triggers.
      {
        id: "page.copyForAgent",
        labelKey: "pageCopyForAgent",
        // ⇧ obligatory: ⌘L bare is taken by the browser address bar
        // and never reaches the page (see components/pages/page-view.tsx).
        keys: [["mod", "⇧", "L"]],
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
      // The filter in the left column, on screens that have one
      // (triage, returns, pull requests, sessions, settings). It REDUCES the list
      // displayed — the palette searches everywhere and takes it elsewhere.
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
      // The same shortcut as dictation, where there was nothing to dictate:
      // form opens open mic. Surfaces that ALREADY wear ⌘⇧D
      // (ticket panel, Objectives page) keep it for themselves.
      {
        id: "create.issueDictate",
        labelKey: "createIssueDictate",
        keys: [["mod", "⇧", "D"]],
      },
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
      // The only shortcut in the section that ALSO accepts multiple selection:
      // when the pill is there, “@” speaks of checked tickets (MIN-105).
      { id: "card.askNumo", labelKey: "askNumo", keys: [["@"]] },
      { id: "card.copyPrompt", labelKey: "copyPrompt", keys: [["⇧", "P"]] },
      { id: "card.launchAgent", labelKey: "launchAgent", keys: [["⇧", "A"]] },
      // Mounted wherever DictateButton carries the shortcut: ticket panel
      // and “new ticket” dialog. He needs ⌘: a combo ⇧ alone
      // triggered on a capital letter typed in the title or description.
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
 * The same shortcut, but as WRITTEN IN A SENTENCE — “⌘K” on a
 * Mac, “Ctrl+K” elsewhere. `KbdSequence` renders keys side by side; a
 * procedure or a toast, they need a string, and the "+" that the
 * Windows world expects between the two cannot be guessed from an array of tokens.
 *
 * To be called only on the client side (`navigator`): in server rendering there is no de
 * platform to read, and the phrase would say "Ctrl" to a Mac user. For
 * a RENDERED phrase (as opposed to a gesture-triggered toast), pass
 * through `useModShortcut`, which handles hydration.
 */
export function formatModShortcut(key: string): string {
  const mod = resolveKeyToken("mod");
  return mod === "⌘" ? `⌘${key}` : `${mod}+${key}`;
}

/**
 * The same, with ⇧ — “⌘⇧L” on a Mac, “Ctrl+Shift+L” elsewhere.
 *
 * Written separately rather than passing “⇧L” to the previous one: outside Mac the expected form
 * is “Ctrl+Shift+L ”, with the word and the second “+”, not
 * “Ctrl+⇧L” — a Mac symbol in the middle of a Windows sentence.
 */
export function formatModShiftShortcut(key: string): string {
  const mod = resolveKeyToken("mod");
  return mod === "⌘" ? `⌘⇧${key}` : `${mod}+Shift+${key}`;
}
