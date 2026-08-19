// Where does a notification lead, and by what sentence is it said (MIN-183).
//
// Both lived on the inbox page, and no longer had their place there
// from the moment a notification is ALSO read outside the app: the service
// worker opens a URL on click, and the pushed payload already carries the
// sentence. Leaving them there would have meant rewriting them identically
// server — that is, let them diverge.
//
// PUR module (no `server-only`, no React): the page reads it, makes it
// de charge utile aussi.

import type { NotificationType } from "./types";
import type { MessageKey } from "./i18n-keys";

/** The target of a notification, reduced to what decides its destination. */
export interface NotificationTarget {
  project_id: string | null;
  issue_id: string | null;
  /** Conversation de l'agent de code, independante de ses contextes. */
  agent_conversation_id?: string | null;
  objective_id?: string | null;
  feedback_post_id?: string | null;
  /** A ROUTINE (MIN-185): its executions are read in the routine, and
 nowhere else — hence its own destination. */
  routine_id?: string | null;
  /** A PULL REQUEST: it is read on the Pull requests page, which is global
 like the Agents view — and it does not necessarily have a ticket. */
  pull_request_id?: string | null;
  /** A PAGE from the wiki (MIN-278). */
  page_id?: string | null;
  /** The BLOCK referred to in this page, when we know it: the mention
 has been placed there. This is the anchor of `blockLink` (components/pages/block-actions.ts),
 that the page follows when opened (page-view.tsx). */
  block_id?: string | null;
}

/**
 * The path opened by a notification, or `null` when it leads nowhere
 * (no project: a line whose project has been deleted).
 *
 * THE ORDER counts and is not arbitrary: a line only carries one target, but
 * nothing in the schema requires it, and the goal comes before the ticket because
 * a goal notification can carry a context `issue_id`.
 */
export function notificationTargetPath(n: NotificationTarget): string | null {
  // The routine passes BEFORE the project test: its screen is global (the view
  // routines, all projects combined), so it leads somewhere even if the
  // line has no project.
  if (n.routine_id) return `/routines?routine=${n.routine_id}`;
  // The pull request too: its page is global, and a PR without a ticket has nothing
  // else to open — this is even the normal case of a human RA.
  if (n.pull_request_id) return `/pull-requests?pr=${n.pull_request_id}`;
  if (n.agent_conversation_id) return `/agents?run=${n.agent_conversation_id}`;
  if (!n.project_id) return null;
  if (n.objective_id) {
    return `/projects/${n.project_id}/objectives?open=${n.objective_id}`;
  }
  if (n.feedback_post_id) {
    return `/projects/${n.project_id}/feedback?post=${n.feedback_post_id}`;
  }
  // A PAGE (MIN-278): it has its own route, not a parameter on the board.
  // The block is added as a FRAGMENT — it does not go to the server, does not break anything
  // route, and this is already the form of block links (`blockLink`).
  if (n.page_id) {
    const path = `/projects/${n.project_id}/pages/${n.page_id}`;
    return n.block_id ? `${path}#${n.block_id}` : path;
  }
  if (n.issue_id) return `/projects/${n.project_id}?issue=${n.issue_id}`;
  return null;
}

/**
 * Query parameters that IDENTIFY the target in the paths above,
 * as opposed to those that just decorate the screen.
 *
 * These are used to respond to "Is the page shown for this
 * notification?" », to close the pushed banner when we get there
 * (lib/push/dismiss.ts). The path alone is not enough: two routines live
 * on the same `/routines`, two tickets on the same board.
 *
 * **One more target in `notificationTargetPath` = its parameter here**, otherwise
 * arriving at one would close the notifications of all the others. The test
 * from lib/push/dismiss.test.ts checks it target by target.
 *
 * A PAGE (MIN-278) does not need it, and it is the only one in this case: its id
 * is a path SEGMENT, not a parameter — no two pages share never
 * a URL. The block fragment is not included in the comparison: arriving
 * on the page closes the notification, whether we jumped to the correct block or not.
 */
export const NOTIFICATION_TARGET_PARAMS = [
  "open",
  "post",
  "issue",
  "routine",
  "pr",
  "run",
] as const;

/** The i18n key of the phrase "who did what", namespace `Inbox`. Typed as
 * `MessageKey` and not as `string`: a key removed from the catalog no longer compiles
 *, instead of being displayed as "Inbox...." on the screen. */
export const NOTIFICATION_LINE_KEYS: Record<
  NotificationType,
  MessageKey<"Inbox">
> = {
  assigned: "lineAssigned",
  mention: "lineMention",
  comment: "lineComment",
  agent_done: "lineAgentDone",
  agent_question: "lineAgentQuestion",
  agent_failed: "lineAgentFailed",
  feedback_new: "lineFeedbackNew",
  pr_reviewed: "linePrReviewed",
  pr_merged: "linePrMerged",
  pr_opened: "linePrOpened",
  automation_paused: "lineAutomationPaused",
  automation_stopped: "lineAutomationStopped",
  routine_done: "lineRoutineDone",
  page_mention: "linePageMention",
  page_agent_edit: "linePageAgentEdit",
  page_comment: "linePageComment",
};

/** Numo answers use a reply-specific sentence instead of the generic comment line. */
export function notificationLineKey(
  type: NotificationType,
  fromNumo: boolean
): MessageKey<"Inbox"> {
  if (fromNumo && type === "comment") return "lineNumoReply";
  return NOTIFICATION_LINE_KEYS[type];
}
