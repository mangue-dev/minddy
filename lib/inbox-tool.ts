import type { MyNotification } from "@/lib/types";

export type InboxReadState = "all" | "unread" | "read";
export type InboxReadCategory = "all" | "mentions";

export interface InboxToolOptions {
  state?: InboxReadState;
  category?: InboxReadCategory;
  query?: string;
  limit?: number;
}

function actorLabel(notification: MyNotification): string {
  if (notification.from_numo) return "Numo";
  if (notification.via_automation) return "Automation";
  if (notification.via_smart_assign) return "Smart Assign";
  if (notification.via_mcp) {
    return (
      notification.api_key_name ?? notification.api_key_agent ?? "MCP agent"
    );
  }
  return notification.actor_name ?? "Someone";
}

function targetOf(notification: MyNotification) {
  if (notification.issue_id) {
    return {
      kind: "issue",
      id: notification.issue_id,
      identifier:
        notification.project_key && notification.issue_number != null
          ? `${notification.project_key}-${notification.issue_number}`
          : null,
      title: notification.issue_title,
    };
  }
  if (notification.pull_request_id) {
    return {
      kind: "pull_request",
      id: notification.pull_request_id,
      identifier:
        notification.pull_request_number != null
          ? `#${notification.pull_request_number}`
          : null,
      title: notification.pull_request_title,
    };
  }
  if (notification.page_id) {
    return {
      kind: "page",
      id: notification.page_id,
      title: notification.page_title,
      block_id: notification.block_id,
    };
  }
  if (notification.objective_id) {
    return {
      kind: "objective",
      id: notification.objective_id,
      title: notification.objective_name,
    };
  }
  if (notification.feedback_post_id) {
    return {
      kind: "feedback",
      id: notification.feedback_post_id,
      title: notification.feedback_title,
    };
  }
  if (notification.routine_id) {
    return {
      kind: "routine",
      id: notification.routine_id,
      title: notification.routine_title,
    };
  }
  if (notification.agent_conversation_id) {
    return {
      kind: "agent_conversation",
      id: notification.agent_conversation_id,
      title: notification.agent_conversation_title,
    };
  }
  return { kind: "inbox", id: null, title: null };
}

function searchableFields(
  notification: MyNotification,
): (string | null | undefined)[] {
  const target = targetOf(notification);
  return [
    notification.type,
    actorLabel(notification),
    notification.project_key,
    "identifier" in target ? target.identifier : null,
    target.title,
    notification.comment_excerpt,
  ];
}

function matchesQuery(
  query: string,
  fields: (string | null | undefined)[],
): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const haystack = normalize(fields.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

/** Compact, model-facing view of the hydrated inbox shared by Numo and MCP agents. */
export function buildInboxToolResult(
  notifications: MyNotification[],
  options: InboxToolOptions = {},
) {
  const state = options.state ?? "unread";
  const category = options.category ?? "all";
  const query = options.query?.trim() ?? "";
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 50)));

  const matched = notifications.filter((notification) => {
    if (state === "unread" && notification.read_at) return false;
    if (state === "read" && !notification.read_at) return false;
    if (
      category === "mentions" &&
      notification.type !== "mention" &&
      notification.type !== "page_mention"
    ) {
      return false;
    }
    return !query || matchesQuery(query, searchableFields(notification));
  });

  return {
    state,
    category,
    query: query || null,
    unread_count: notifications.filter((notification) => !notification.read_at)
      .length,
    matched_count: matched.length,
    truncated: matched.length > limit,
    notifications: matched.slice(0, limit).map((notification) => ({
      id: notification.id,
      type: notification.type,
      unread: !notification.read_at,
      read_at: notification.read_at,
      created_at: notification.created_at,
      actor: actorLabel(notification),
      project_id: notification.project_id,
      project_key: notification.project_key,
      target: targetOf(notification),
      comment_excerpt: notification.comment_excerpt,
    })),
  };
}
