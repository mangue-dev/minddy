// Home tips teach useful gestures that users may not discover by clicking.
// One short tip is selected per page load and stays stable while the page is open.
//
// Three rules govern this pool:
// 1. Each tip describes one behavior supported by the current implementation.
// 2. Shortcut keys come from CHEATSHEET via a shortcut ID, never from tip text.
// 3. Messages require no values: dynamic tip keys bypass next-intl's strict
//    typing, and a missing value would display the translation path instead.
// lib/home-tips.test.ts checks these catalog and shortcut invariants.

import type { MessageKey } from "@/lib/i18n-keys";
import { CHEATSHEET, type CheatsheetShortcut } from "@/lib/keyboard/shortcuts";

export interface HomeTip {
  /** The message key under `Home.tips`. */
  key: MessageKey<"Home.tips">;
  /**
   * The shortcut ID in CHEATSHEET, when applicable. Its keys are rendered
   * after the message without duplicating them in the translation catalogs.
   */
  shortcut?: string;
}

const tip = (key: MessageKey<"Home.tips">, shortcut?: string): HomeTip => ({
  key,
  shortcut,
});

/**
 * The tip pool, ordered by topic for review. Selection does not depend on
 * topic order. Add a tip when shipping a useful behavior that is hard to discover.
 */
export const HOME_TIPS: HomeTip[] = [
  // Keyboard shortcuts for everyday actions.
  tip("palette", "gen.palette"),
  tip("cheatsheet", "gen.cheatsheet"),
  tip("search", "gen.search"),
  tip("filterList", "gen.filterList"),
  tip("undo", "gen.undo"),
  tip("newIssue", "create.issue"),
  tip("newObjective", "create.objective"),
  tip("chords", "nav.allIssues"),
  tip("tabSwitch", "nav.numberedTab"),
  tip("myIssues", "nav.myIssues"),
  tip("notebook", "nav.notes"),
  tip("inbox", "nav.inbox"),
  tip("assistant", "nav.assistant"),

  // Issue card actions available on hover.
  tip("hoverCard", "card.status"),
  tip("hoverAssignee", "card.assignee"),
  tip("hoverDueDate", "card.dueDate"),
  tip("openCard", "card.open"),
  tip("askNumo", "card.askNumo"),
  tip("copyPrompt", "card.copyPrompt"),
  tip("launchAgent", "card.launchAgent"),
  tip("dictateIssue", "create.issueDictate"),
  tip("objectiveIssues", "nav.objectiveIssues"),

  // Mouse gestures that menus do not reveal.
  tip("shiftClick"),
  tip("marquee"),
  tip("rightClick"),

  // Boards and issues.
  tip("savedViews"),
  tip("shareView"),
  tip("recurring"),
  tip("subIssues"),
  tip("relations"),
  tip("plan"),
  tip("smartFill"),
  tip("smartAssign"),
  tip("autoAssignOnStart"),
  tip("drafts"),
  tip("trash"),

  // Notebook, pages, cycles, and objectives.
  tip("notebookSlash"),
  tip("notebookPrompt"),
  tip("pagesSlash"),
  tip("pagesPublish"),
  tip("pagesExport"),
  tip("pagesComment"),
  tip("pagesHistory"),
  tip("pagesBacklinks"),
  tip("pageCopyForAgent", "page.copyForAgent"),
  tip("cycles"),
  tip("objectives"),
  tip("stats"),

  // Agents, repositories, and integrations.
  tip("agentPr"),
  tip("routines", "nav.routines"),
  tip("automations"),
  tip("mcp"),
  tip("webhooks"),
  tip("feedbackBoard"),
  tip("import"),
  tip("accountTransfer"),
  tip("export"),

  // Interface and account preferences.
  tip("sidebarVisibility"),
  tip("sendShortcut"),
  tip("desktopApp"),
];

/** Index CHEATSHEET shortcuts by ID. */
const SHORTCUTS: ReadonlyMap<string, CheatsheetShortcut> = new Map(
  CHEATSHEET.flatMap((section) =>
    section.shortcuts.map((sc) => [sc.id, sc] as const),
  ),
);

/**
 * Return a tip's shortcut, or undefined when none is specified or its ID
 * is unknown. The catalog test prevents unknown IDs from silently losing keys.
 */
export function tipShortcut(t: HomeTip): CheatsheetShortcut | undefined {
  return t.shortcut ? SHORTCUTS.get(t.shortcut) : undefined;
}

/**
 * Select a tip deterministically from a seed so it stays stable until reload,
 * like the greeting above it (lib/home-greeting.ts).
 */
export function pickTip(seed: number): HomeTip {
  return HOME_TIPS[Math.abs(Math.trunc(seed)) % HOME_TIPS.length];
}
