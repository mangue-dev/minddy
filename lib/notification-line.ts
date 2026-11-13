/**
 * What a notification SAYS (MIN-291, redesigned in MIN-975), on every surface
 * that shows one: the inbox row, the command palette, the desktop banner and
 * the push banner.
 *
 * A notification reads in three lines:
 *
 * 1. WHO acted: a person, Numo, Smart Assign, an MCP agent, or the source of
 *    an event without a minddy actor (the feedback board, the forge).
 * 2. WHAT happened, as a short sentence whose object is a typed mention of the
 *    target: “Mentioned you in {target}”. The inbox draws the target as a
 *    pill; a banner prints its label.
 * 3. Optional CONTEXT: the comment excerpt, the issue or pull request title,
 *    the body of a Numo note. Omitted when it would only repeat line 2.
 *
 * PURE module: the translated words come in as parameters, so a native
 * notification and the server push builder read it as well as a component.
 */

import { mcpActorLabel } from "./mcp-agents";
import { splitMentionLinks, type MentionLinkType } from "./mention-link";
import type { MessageKey } from "./i18n-keys";
import type { MyNotification, NotificationType } from "./types";

/** The few translated words the lines need. */
export interface NotificationLabels {
  /** `Inbox.someone`: when nobody can be named. */
  someone: string;
  /** `Timeline.mcpFallback`: an MCP agent whose key is not named. */
  mcpFallback: string;
  /** `Inbox.somePageFallback`: a page without a title still has a label. */
  somePageFallback: string;
  /** `Inbox.someIssueFallback`, already formatted with the word for issue. */
  someIssueFallback: string;
  /** `Inbox.actorAutomation`: a project automation (MIN-147). */
  automation: string;
  /** `Inbox.actorFeedbackBoard`: a new post on the public board. */
  feedbackBoard: string;
}

/** Who a notification names, and which figure the inbox draws for them. */
export type NotificationActorKind =
  | "person"
  | "numo"
  | "smart_assign"
  | "automation"
  | "mcp"
  | "feedback"
  | "forge";

export interface NotificationActor {
  kind: NotificationActorKind;
  name: string;
}

/** Product and forge names keep their own spelling in every language. */
const FORGE_NAMES: Record<string, string> = { github: "GitHub", gitlab: "GitLab" };

/** Types written by Numo itself, whoever the row is stored under. */
const NUMO_TYPES: readonly NotificationType[] = ["agent_question", "agent_failed", "numo_message"];

/**
 * Who acted, in the terms of the timeline: an MCP action is the agent's, an
 * automatic assignment Smart Assign's, and “Someone” is the last resort.
 */
export function notificationActor(
  n: MyNotification,
  labels: NotificationLabels,
): NotificationActor {
  if (n.from_numo || NUMO_TYPES.includes(n.type)) return { kind: "numo", name: "Numo" };
  if (n.via_smart_assign) return { kind: "smart_assign", name: "Smart Assign" };
  if (n.via_automation) return { kind: "automation", name: labels.automation };
  if (n.via_mcp) {
    return { kind: "mcp", name: mcpActorLabel(n.api_key_agent, n.api_key_name, labels.mcpFallback) };
  }
  // Events without a minddy actor name their source rather than “Someone”.
  if (n.type === "feedback_new") return { kind: "feedback", name: labels.feedbackBoard };
  if (n.type === "pr_opened") {
    const forge = n.pull_request_provider ? FORGE_NAMES[n.pull_request_provider] : undefined;
    if (forge) return { kind: "forge", name: forge };
  }
  return { kind: "person", name: n.actor_name ?? labels.someone };
}

/** The record a notification's sentence points at, drawn as a mention. */
export interface NotificationTargetMention {
  type: MentionLinkType;
  id: string;
  /** The label the row already knows: the pill and the banners print it. */
  label: string;
}

function issueLabel(n: MyNotification, labels: NotificationLabels): string {
  return n.project_key && n.issue_number != null
    ? `${n.project_key}-${n.issue_number}`
    : n.issue_title || labels.someIssueFallback;
}

/**
 * The target of the sentence, or `null` when it has none (an instance
 * variable, a Numo note, whose own title says what it is about). The order
 * follows `notificationTargetPath`: a row carries one target, but nothing in
 * the schema enforces it, and both functions must pick the same one.
 */
export function notificationTargetMention(
  n: MyNotification,
  labels: NotificationLabels,
): NotificationTargetMention | null {
  if (n.type === "instance_config_changed" || n.type === "numo_message") return null;
  // A backfill (MIN-903) and the board's posts are about the project as a
  // whole: a feedback post has no mention of its own.
  if (n.type === "smart_assign_batch" || n.feedback_post_id) {
    return n.project_id
      ? { type: "project", id: n.project_id, label: n.project_name ?? n.project_key ?? "" }
      : null;
  }
  if (n.routine_id) return { type: "routine", id: n.routine_id, label: n.routine_title ?? "" };
  if (n.pull_request_id) {
    return {
      type: "pull_request",
      id: n.pull_request_id,
      label: n.pull_request_number != null ? `#${n.pull_request_number}` : n.pull_request_title ?? "",
    };
  }
  if (n.objective_id) return { type: "objective", id: n.objective_id, label: n.objective_name ?? "" };
  if (n.page_id) return { type: "page", id: n.page_id, label: n.page_title || labels.somePageFallback };
  if (n.issue_id) return { type: "issue", id: n.issue_id, label: issueLabel(n, labels) };
  return null;
}

/** The placeholder every title sentence uses for its target. */
export const TARGET_PLACEHOLDER = "target";

/**
 * The `Inbox` key of the sentence on line 2. Typed as `MessageKey`: a key
 * removed from the catalogs stops compiling instead of showing “Inbox.…”.
 */
export const NOTIFICATION_TITLE_KEYS: Record<NotificationType, MessageKey<"Inbox">> = {
  assigned: "titleAssigned",
  mention: "titleMention",
  comment: "titleComment",
  agent_question: "titleAgentQuestion",
  agent_failed: "titleAgentFailed",
  feedback_new: "titleFeedbackNew",
  pr_opened: "titlePrOpened",
  instance_config_changed: "titleInstanceConfigChanged",
  page_mention: "titleMention",
  page_comment: "titleComment",
  smart_assign_batch: "titleSmartAssignBatch",
  numo_message: "titleNumoMessage",
};

/**
 * Numo's answer to a comment says it replied, not that it commented; a
 * comment on a feedback post names the board, since its pill is the project.
 */
export function notificationTitleKey(
  n: Pick<MyNotification, "type" | "from_numo" | "feedback_post_id">,
): MessageKey<"Inbox"> {
  if (n.from_numo && (n.type === "comment" || n.type === "page_comment")) return "titleNumoReply";
  if (n.feedback_post_id && n.type === "comment") return "titleFeedbackComment";
  if (n.feedback_post_id && n.type === "mention") return "titleFeedbackMention";
  return NOTIFICATION_TITLE_KEYS[n.type];
}

/** The values a title sentence may use, with the target as `target`. */
export function notificationTitleValues(
  n: MyNotification,
  target: string,
): { target: string; count: number } {
  return { target, count: n.issue_count ?? 0 };
}

/** A sentence split around the target placeholder's stand-in. */
export function splitAtTarget(sentence: string, token: string): string[] {
  return sentence.split(token);
}

/** A Markdown text with its typed mentions printed as their labels, for a
    surface that cannot draw a pill (a banner). Labels are what the server
    relabeled for the reader; a mention without one prints nothing. */
export function mentionsAsPlainText(markdown: string): string {
  return splitMentionLinks(markdown)
    .map((piece) => (typeof piece === "string" ? piece : piece.label))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Line 3, as Markdown that may hold typed mentions (a Numo note), or `null`
 * when the sentence already says everything. The context repeats nothing:
 * an issue's title is context, its identifier is already the pill.
 */
export function notificationContext(n: MyNotification): string | null {
  if (n.type === "numo_message") return n.numo_note_body || null;
  if (n.comment_excerpt) return n.comment_excerpt;
  if (n.type === "smart_assign_batch" || n.type === "instance_config_changed") return null;
  if (n.feedback_post_id) return n.feedback_title || null;
  if (n.routine_id || n.objective_id || n.page_id) return null;
  if (n.pull_request_id) return n.pull_request_title || null;
  if (n.issue_id) return n.issue_title || null;
  return null;
}

/**
 * Line 2 of a Numo note: its own title, which may hold mentions. `null` for
 * every other type, which use a catalog sentence.
 */
export function notificationOwnTitle(n: MyNotification): string | null {
  return n.type === "numo_message" && n.numo_note_title ? n.numo_note_title : null;
}

/**
 * The whole notification as plain text, for banners and search: the actor,
 * the sentence with its target's label, and the context. `translate` renders
 * an `Inbox` key with its values.
 */
export function notificationPlainText(
  n: MyNotification,
  labels: NotificationLabels,
  translate: (key: MessageKey<"Inbox">, values: { target: string; count: number }) => string,
): { actor: string; title: string; context: string | null } {
  const own = notificationOwnTitle(n);
  const target = notificationTargetMention(n, labels);
  const title = own !== null
    ? mentionsAsPlainText(own)
    : translate(notificationTitleKey(n), notificationTitleValues(n, target?.label ?? ""));
  const context = notificationContext(n);
  return {
    actor: notificationActor(n, labels).name,
    title,
    context: context ? mentionsAsPlainText(context) : null,
  };
}
