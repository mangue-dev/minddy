/**
 * What a notification SAYS — what we're talking about, and who did what (MIN-291).
 *
 * These two sentences already existed in duplicate: in the inbox
 * page (app/(app)/inbox/page.tsx) and in the payload factory push
 * (lib/server/push/payload.ts), which is careful to say that it reuses the
 * keys from the inbox "so as not to let them diverge". The desktop app en
 * would have made a third — hence the extraction here, on the side where both
 * client surfaces can read it.
 *
 * PUR module: the translated labels go into PARAMETERS. This is what makes it
 * readable from a native notification (which doesn't have a React context under the
 * main at the time it builds) as well as from a component.
 */

import { mcpActorLabel } from "./mcp-agents";
import type { MyNotification } from "./types";

/** The few translated words the line needs. */
export interface NotificationLabels {
  /** `Inbox.someone` — quand on ne sait vraiment pas qui a agi. */
  someone: string;
  /** `Timeline.mcpFallback` — an MCP agent whose key is not named. */
  mcpFallback: string;
  /** `Inbox.somePageFallback` — a page without a title still has one. */
  somePageFallback: string;
  /** `Inbox.someIssueFallback`, already formatted with the word “ticket” / “issue”. */
  someIssueFallback: string;
  /** A general conversation from Numo about which the titler has not written anything. */
  someAgentConversationFallback: string;
}

/**
 * Who acted, in the terms of the timeline: an action passed by the MCP is
 * that of the AGENT, an automatic assignment that of Smart Assign — never
 * “Someone”, who does not inform anyone.
 */
export function notificationActor(
  n: MyNotification,
  labels: NotificationLabels
): string {
  if (n.via_smart_assign) return "Smart Assign";
  if (n.via_mcp) {
    return mcpActorLabel(n.api_key_agent, n.api_key_name, labels.mcpFallback);
  }
  return n.actor_name ?? labels.someone;
}

/**
 * What we're talking about: the title of the target. The order follows that of
 * `notificationTargetPath` — one line carries only one target, but nothing in the
 * schema requires it, and the two functions must designate the same one.
 */
export function notificationTitle(
  n: MyNotification,
  labels: NotificationLabels
): string {
  if (n.objective_id) return n.objective_name ?? "";
  if (n.feedback_post_id) return n.feedback_title ?? "";
  // A routine (MIN-185): its title IS the line — it has no ticket
  // name, and the fallback “a ticket” would lie about what happened.
  if (n.routine_id) return n.routine_title ?? "";
  // A pull request: its title, preceded by its number by the reference
  // displayed next to it — it does not necessarily have a ticket to name.
  if (n.pull_request_id) return n.pull_request_title ?? "";
  if (n.agent_conversation_id && !n.issue_id) {
    return n.agent_conversation_title || labels.someAgentConversationFallback;
  }
  // A PAGE from the wiki (MIN-278): its title, and the explicit fallback when it
  // doesn't have one — a line without a title no longer says what we're talking about.
  if (n.page_id) return n.page_title || labels.somePageFallback;
  return n.issue_title ?? labels.someIssueFallback;
}
