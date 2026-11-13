import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import {
  NOTIFICATION_TITLE_KEYS,
  mentionsAsPlainText,
  notificationActor,
  notificationContext,
  notificationPlainText,
  notificationTargetMention,
  notificationTitleKey,
  type NotificationLabels,
} from "./notification-line";
import type { MyNotification } from "./types";

const LABELS: NotificationLabels = {
  someone: "Someone",
  mcpFallback: "An agent",
  somePageFallback: "Untitled page",
  someIssueFallback: "an issue",
  automation: "Automation",
  feedbackBoard: "Feedback board",
};

function notification(patch: Partial<MyNotification>): MyNotification {
  return {
    id: "n1",
    type: "comment",
    read_at: null,
    created_at: "2026-11-13T10:00:00Z",
    issue_id: null,
    issue_number: null,
    issue_title: null,
    issue_status: null,
    objective_id: null,
    objective_name: null,
    feedback_post_id: null,
    feedback_title: null,
    routine_id: null,
    routine_title: null,
    pull_request_id: null,
    pull_request_number: null,
    pull_request_title: null,
    pull_request_provider: null,
    page_id: null,
    page_title: null,
    block_id: null,
    project_id: "p1",
    project_key: "MIN",
    actor_name: null,
    actor_avatar_seed: null,
    from_numo: false,
    via_mcp: false,
    api_key_agent: null,
    api_key_name: null,
    via_smart_assign: false,
    via_automation: false,
    comment_excerpt: null,
    numo_note_title: null,
    numo_note_body: null,
    issue_count: null,
    project_name: null,
    ...patch,
  };
}

const t = createTranslator({ locale: "en", messages: en, namespace: "Inbox" });
const plain = (n: MyNotification) =>
  notificationPlainText(n, LABELS, (key, values) => t(key, values));

describe("notificationActor", () => {
  it("names the automated actors instead of the account behind them", () => {
    expect(notificationActor(notification({ via_smart_assign: true }), LABELS))
      .toEqual({ kind: "smart_assign", name: "Smart Assign" });
    expect(notificationActor(notification({ via_mcp: true, api_key_agent: "claude" }), LABELS).kind)
      .toBe("mcp");
    expect(notificationActor(notification({ from_numo: true, actor_name: "Numo" }), LABELS))
      .toEqual({ kind: "numo", name: "Numo" });
    expect(notificationActor(notification({ type: "agent_failed" }), LABELS).kind).toBe("numo");
  });

  it("names the source of an event that has no minddy actor", () => {
    expect(notificationActor(notification({ type: "feedback_new" }), LABELS))
      .toEqual({ kind: "feedback", name: "Feedback board" });
    expect(notificationActor(notification({ type: "pr_opened", pull_request_provider: "gitlab" }), LABELS))
      .toEqual({ kind: "forge", name: "GitLab" });
  });

  it("names the person, and Someone only when nobody is known", () => {
    expect(notificationActor(notification({ actor_name: "Léa" }), LABELS).name).toBe("Léa");
    expect(notificationActor(notification({}), LABELS).name).toBe("Someone");
  });
});

describe("notificationTargetMention", () => {
  it("draws the issue by its identifier", () => {
    expect(notificationTargetMention(
      notification({ issue_id: "i1", issue_number: 42, issue_title: "Fix login" }), LABELS,
    )).toEqual({ type: "issue", id: "i1", label: "MIN-42" });
  });

  it("prefers the objective over the issue it carries for context", () => {
    expect(notificationTargetMention(
      notification({ objective_id: "o1", objective_name: "Launch", issue_id: "i1" }), LABELS,
    )?.type).toBe("objective");
  });

  it("points a backfill and the board's posts at their project", () => {
    expect(notificationTargetMention(
      notification({ type: "smart_assign_batch", project_name: "Aurora", issue_count: 3 }), LABELS,
    )).toEqual({ type: "project", id: "p1", label: "Aurora" });
    expect(notificationTargetMention(
      notification({ type: "comment", feedback_post_id: "f1", project_name: "Aurora" }), LABELS,
    )?.type).toBe("project");
  });

  it("gives an untitled page a label and a note no target", () => {
    expect(notificationTargetMention(notification({ type: "page_mention", page_id: "pg", page_title: "" }), LABELS)?.label)
      .toBe("Untitled page");
    expect(notificationTargetMention(notification({ type: "numo_message", issue_id: "i1" }), LABELS)).toBeNull();
    expect(notificationTargetMention(notification({ type: "instance_config_changed", project_id: null }), LABELS)).toBeNull();
  });
});

describe("notificationContext", () => {
  it("gives the excerpt, then the title the pill does not show", () => {
    expect(notificationContext(notification({ issue_id: "i1", issue_title: "Fix", comment_excerpt: "Look" })))
      .toBe("Look");
    expect(notificationContext(notification({ type: "assigned", issue_id: "i1", issue_title: "Fix" })))
      .toBe("Fix");
    expect(notificationContext(notification({ type: "pr_opened", pull_request_id: "pr", pull_request_title: "Bump" })))
      .toBe("Bump");
  });

  it("adds nothing when the sentence already says it", () => {
    expect(notificationContext(notification({ type: "page_mention", page_id: "pg", page_title: "Notes" }))).toBeNull();
    expect(notificationContext(notification({ type: "agent_failed", routine_id: "r", routine_title: "Daily" }))).toBeNull();
    expect(notificationContext(notification({ type: "smart_assign_batch", issue_count: 2 }))).toBeNull();
  });
});

describe("notificationTitleKey", () => {
  it("has a sentence for every type in the catalog", () => {
    for (const key of Object.values(NOTIFICATION_TITLE_KEYS)) {
      expect(en.Inbox, `Inbox.${key}`).toHaveProperty(key);
    }
  });

  it("says Numo replied, and names the board for a post's comment", () => {
    expect(notificationTitleKey({ type: "comment", from_numo: true, feedback_post_id: null })).toBe("titleNumoReply");
    expect(notificationTitleKey({ type: "comment", from_numo: false, feedback_post_id: "f" })).toBe("titleFeedbackComment");
    expect(notificationTitleKey({ type: "mention", from_numo: false, feedback_post_id: "f" })).toBe("titleFeedbackMention");
  });
});

describe("notificationPlainText", () => {
  it("prints the target's label where the inbox draws a pill", () => {
    expect(plain(notification({
      type: "mention", actor_name: "Jérémy", issue_id: "i1", issue_number: 15, comment_excerpt: "Look at this",
    }))).toEqual({ actor: "Jérémy", title: "Mentioned you in MIN-15", context: "Look at this" });
    expect(plain(notification({
      type: "smart_assign_batch", via_smart_assign: true, issue_count: 3, project_name: "Aurora",
    })).title).toBe("Assigned you 3 issues in Aurora");
  });

  it("prints a Numo note in its own words, its mentions as labels", () => {
    expect(plain(notification({
      type: "numo_message",
      numo_note_title: "Reminder",
      numo_note_body: "Create the issues in [@minddy Preview](mention:project/p1) today",
    }))).toEqual({ actor: "Numo", title: "Reminder", context: "Create the issues in minddy Preview today" });
  });
});

describe("mentionsAsPlainText", () => {
  it("keeps the text around a mention and drops an unlabeled one", () => {
    expect(mentionsAsPlainText("See [@MIN-4](mention:issue/abc) and [@](mention:page/def)."))
      .toBe("See MIN-4 and .");
  });
});
