// Tips from the bottom of the reception: what minddy knows how to do and what we don't
// don't discover by clicking.
//
// A tracker is controlled by its screens, and used by its shortcuts. THE
// second learning never happens alone: ​​no one opens the cheat
// sheet to learn that it exists, no one will read the settings for
// discover Smart Fill. The home page is the only screen we see every day
// without looking for anything specific — it is therefore the only place where a sentence can
// apprendre quelque chose sans interrompre personne.
//
// Hence the form: ONE line, at the bottom, drawn at random each time you load, never
// twice the same in the same page life. She expects no response and does not
// does not close; that's what keeps him there every day.
//
// Three rules carry the file:
//
// 1. **A tip says one TRUE thing, and only one thing.** It describes a gesture
// real from today's application. An outdated tip is worse than none
//     d'astuce : elle envoie chercher un bouton qui n'existe plus.
// 2. **The keys are not copied here.** A tip that talks about a
// shortcut quotes its `id` in the cheat sheet register
// (lib/keyboard/shortcuts.ts) and nothing else; the keys are read
// there when rendered. The day ⌘K becomes something else, the trick follows without
// let's think about it - and that was indeed the pitfall, two places which promise
// two different keys for the same gesture.
// 3. **No placeholder.** The keys pass through this table, therefore outside the
//     typage strict de next-intl (cf. lib/i18n-keys.ts) : un message qui
// would request values ​​would display “Home.tips.x” at the bottom of the home page.
// `lib/home-tips.test.ts` refuses any tip whose message carries one.
//
// The register is that of the rest of the reception: a colleague who shows a gesture,
// not an advertising tooltip. A tip fits in one line, in the indicative,
// and doesn't sell anything.

import type { MessageKey } from "@/lib/i18n-keys";
import { CHEATSHEET, type CheatsheetShortcut } from "@/lib/keyboard/shortcuts";

export interface HomeTip {
  /** The phrase, under `Home.tips`. */
  key: MessageKey<"Home.tips">;
  /**
 * The id of the shortcut in `CHEATSHEET`, when the hint designates one. Its
 * keys are rendered at the end of the sentence, READ IN THE REGISTER: they are never written here, nor in the message catalog.
 */
  shortcut?: string;
}

const tip = (key: MessageKey<"Home.tips">, shortcut?: string): HomeTip => ({
  key,
  shortcut,
});

/**
 * The fishpond.
 *
 * The order has no importance on the screen (the draw is uniform); it is
 * only there for rereading, from the most everyday gesture to the most distant setting. Adding a tip is the normal gesture when delivering a
 * functionality that is not visible.
 */
export const HOME_TIPS: HomeTip[] = [
  // — The keyboard, first: these are the gestures that we repeat a hundred times a day.
  tip("palette", "gen.palette"),
  tip("cheatsheet", "gen.cheatsheet"),
  tip("search", "gen.search"),
  tip("filterList", "gen.filterList"),
  tip("undo", "gen.undo"),
  tip("newIssue", "create.issue"),
  tip("newObjective", "create.objective"),
  tip("chords", "nav.allIssues"),
  tip("myIssues", "nav.myIssues"),
  tip("notebook", "nav.notes"),
  tip("inbox", "nav.inbox"),
  tip("assistant", "nav.assistant"),

  // — The hovered map: half the work of a board is done without opening it.
  tip("hoverCard", "card.status"),
  tip("hoverAssignee", "card.assignee"),
  tip("hoverDueDate", "card.dueDate"),
  tip("openCard", "card.open"),
  tip("askNumo", "card.askNumo"),
  tip("copyPrompt", "card.copyPrompt"),
  tip("launchAgent", "card.launchAgent"),
  tip("dictateIssue", "create.issueDictate"),
  tip("objectiveIssues", "nav.objectiveIssues"),

  // — Mouse gestures that no menu announces.
  tip("shiftClick"),
  tip("marquee"),
  tip("rightClick"),

  // — The board and tickets.
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

  // — The notebook, the pages, the cycles, the objectives.
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

  // — What connects minddy to the rest: agent, deposit, entries, exits.
  tip("agentPr"),
  tip("routines"),
  tip("automations"),
  tip("mcp"),
  tip("webhooks"),
  tip("feedbackBoard"),
  tip("import"),
  tip("export"),

  // — Comfort: adjustments that we only look for if we know they exist.
  tip("zenMode"),
  tip("sendShortcut"),
  tip("desktopApp"),
];

/** The cheat sheet register, flat: a shortcut by id. */
const SHORTCUTS: ReadonlyMap<string, CheatsheetShortcut> = new Map(
  CHEATSHEET.flatMap((section) =>
    section.shortcuts.map((sc) => [sc.id, sc] as const),
  ),
);

/**
 * The shortcut for a cheat, as written in the cheat sheet — or
 * `undefined` for a cheat that does not designate any.
 *
 * Returns `undefined` also for an unknown id: a cheat that cites a shortcut
 * deleted still reads like a sentence, and the catalog test is there to make sure it doesn't happen silently.
 */
export function tipShortcut(t: HomeTip): CheatsheetShortcut | undefined {
  return t.shortcut ? SHORTCUTS.get(t.shortcut) : undefined;
}

/**
 * A pool trick, pulled by `seed`. Deterministic with equal seed: it's this
 * that allows the welcome to keep the same tip as long as the page lives, and to change it on the next load — like the greeting just above
 * (lib/home-greeting.ts).
 */
export function pickTip(seed: number): HomeTip {
  return HOME_TIPS[Math.abs(Math.trunc(seed)) % HOME_TIPS.length];
}
