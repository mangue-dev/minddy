import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildPushPayload,
  emptyPushContext,
  loadPushContext,
  toPushLocale,
  type PushContext,
} from "./payload";
import type { NotificationRow } from "@/lib/server/notifications";
import type { NotificationType } from "@/lib/types";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * The pushed payload must say what the inbox row says, in every language.
 * The test goes through the REAL formatter on the real catalogs: it catches
 * a missing key ("Inbox.…") and an unsubstituted placeholder, the two faults
 * the typing lets pass (see CLAUDE.md).
 */

const PROJECT = "11111111-1111-1111-1111-111111111111";
const ISSUE = "22222222-2222-2222-2222-222222222222";
const ACTOR = "33333333-3333-3333-3333-333333333333";

const ALL_TYPES: readonly NotificationType[] = [
  "assigned",
  "mention",
  "comment",
  "agent_question",
  "agent_failed",
  "feedback_new",
  "pr_opened",
  "page_mention",
  "page_comment",
  "instance_config_changed",
  "numo_message",
  "smart_assign_batch",
];

/** The table above must stay COMPLETE: a type added without its sentence
    would push "Inbox.…" on a locked screen. */
const _exhaustive: Record<NotificationType, true> = Object.fromEntries(
  ALL_TYPES.map((type) => [type, true])
) as Record<NotificationType, true>;

function ctxWithIssue(actorName = "Alice"): PushContext {
  const ctx = emptyPushContext();
  ctx.issues.set(ISSUE, { number: 42, title: "Réparer le sélecteur de cycle" });
  ctx.projectKeys.set(PROJECT, "MIN");
  if (actorName) ctx.actorNames.set(ACTOR, actorName);
  return ctx;
}

const issueRow = (type: NotificationType, extra: Partial<NotificationRow> = {}) =>
  ({
    user_id: "u",
    project_id: PROJECT,
    type,
    issue_id: ISSUE,
    actor_id: ACTOR,
    ...extra,
  }) as NotificationRow;

/** A row of every type, with the target its type needs. */
function rowOf(type: NotificationType): NotificationRow {
  switch (type) {
    case "agent_question":
    case "agent_failed":
      return issueRow(type, { issue_id: null, routine_id: "r1", via_assistant: true });
    case "feedback_new":
      return issueRow(type, { issue_id: null, feedback_post_id: "fp", actor_id: null });
    case "pr_opened":
      return issueRow(type, { issue_id: null, pull_request_id: "pr", actor_id: null });
    case "page_mention":
    case "page_comment":
      return issueRow(type, { issue_id: null, page_id: "pg" });
    case "instance_config_changed":
      return issueRow(type, { issue_id: null, project_id: null });
    case "numo_message":
      return issueRow(type, { numo_note_id: "note-1", actor_id: null, via_assistant: true });
    case "smart_assign_batch":
      return issueRow(type, { issue_id: null, issue_count: 3, via_smart_assign: true, actor_id: null });
    default:
      return issueRow(type);
  }
}

function fullCtx(): PushContext {
  const ctx = ctxWithIssue();
  ctx.routines.set("r1", "Daily triage");
  ctx.feedbackPosts.set("fp", { projectId: PROJECT, title: "Dark mode please" });
  ctx.pullRequests.set("pr", { number: 12, title: "Add dark mode", provider: "github" });
  ctx.pages.set("pg", "Product decisions");
  ctx.projectNames.set(PROJECT, "Aurora");
  ctx.numoNotes.set("note-1", { title: "Release blocked", body: "The check failed." });
  return ctx;
}

describe("buildPushPayload", () => {
  it.each(ALL_TYPES)("renders a complete banner in every locale — %s", (type) => {
    const ctx = fullCtx();
    for (const locale of ["en", "fr", "de", "es", "it", "pt-BR"] as const) {
      const payload = buildPushPayload(ctx, rowOf(type), locale);
      expect(payload).not.toBeNull();
      for (const text of [payload!.title, payload!.body]) {
        expect(text).not.toContain("Inbox.");
        expect(text).not.toMatch(/[{}]/);
        expect(text.trim()).not.toBe("");
      }
    }
  });

  it("titles the banner with the actor and prints the target as its label", () => {
    expect(buildPushPayload(ctxWithIssue(), issueRow("mention"), "en")).toEqual({
      title: "Alice",
      body: "Mentioned you in MIN-42\nRéparer le sélecteur de cycle",
      lang: "en-GB",
      url: `/projects/${PROJECT.slice(0, 8)}?issue=${ISSUE.slice(0, 8)}`,
      tag: `/projects/${PROJECT.slice(0, 8)}?issue=${ISSUE.slice(0, 8)}`,
    });
    expect(buildPushPayload(ctxWithIssue(), issueRow("comment"), "fr")?.body)
      .toBe("A commenté MIN-42\nRéparer le sélecteur de cycle");
  });

  it("falls back to a translated Someone, never an empty title", () => {
    const anon = ctxWithIssue("");
    expect(buildPushPayload(anon, issueRow("mention"), "en")!.title).toBe(en.Inbox.someone);
    expect(buildPushPayload(anon, issueRow("mention"), "fr")!.title).toBe(fr.Inbox.someone);
  });

  it("names Smart Assign, the MCP agent and Numo rather than the account", () => {
    const ctx = ctxWithIssue("");
    ctx.apiKeyActors.set("k1", { name: "Claude Code (mcp)", agent: "claude" });
    expect(buildPushPayload(ctx, issueRow("assigned", { actor_id: null, via_smart_assign: true }), "fr")!.title)
      .toBe("Smart Assign");
    expect(buildPushPayload(ctx, issueRow("comment", { actor_id: null, via_mcp: true, api_key_id: "k1" }), "fr")!.title)
      .toContain("Claude");
    // MIN-278: a mention Numo wrote in a page is Numo's, not the account's.
    ctx.pages.set("pg", "Décisions produit");
    expect(buildPushPayload(ctx, issueRow("page_mention", {
      issue_id: null, page_id: "pg", block_id: "b2", via_assistant: true,
    }), "fr")).toMatchObject({
      title: "Numo",
      body: "Vous a mentionné dans Décisions produit",
      url: `/projects/${PROJECT.slice(0, 8)}/pages/pg#b2`,
    });
  });

  it("names the source of a board post and an opened pull request", () => {
    const ctx = fullCtx();
    expect(buildPushPayload(ctx, rowOf("feedback_new"), "en")).toMatchObject({
      title: en.Inbox.actorFeedbackBoard,
      body: "New feedback in Aurora\nDark mode please",
      url: `/projects/${PROJECT.slice(0, 8)}/feedback?post=fp`,
    });
    expect(buildPushPayload(ctx, rowOf("pr_opened"), "en")).toMatchObject({
      title: "GitHub",
      body: "Pull request #12 opened\nAdd dark mode",
      url: "/pull-requests?pr=pr",
    });
    ctx.feedbackPosts.set("fp", { projectId: "foreign-project", title: "Foreign feedback" });
    expect(buildPushPayload(ctx, rowOf("feedback_new"), "fr")).toBeNull();
  });

  it("pushes an instance variable change with its actor and the admin tab", () => {
    const ctx = emptyPushContext();
    ctx.actorNames.set(ACTOR, "Alice");
    expect(buildPushPayload(ctx, rowOf("instance_config_changed"), "en")).toMatchObject({
      title: "Alice",
      body: en.Inbox.titleInstanceConfigChanged,
      url: "/admin?tab=instance",
    });
  });

  it("pushes a backfill as one line with its count and project", () => {
    const ctx = fullCtx();
    expect(buildPushPayload(ctx, rowOf("smart_assign_batch"), "en")).toMatchObject({
      title: "Smart Assign",
      body: "Assigned you 3 issues in Aurora",
      url: `/projects/${PROJECT.slice(0, 8)}`,
    });
    expect(buildPushPayload(ctx, { ...rowOf("smart_assign_batch"), issue_count: 1 }, "fr")?.body)
      .toBe("Vous a assigné 1 ticket dans Aurora");
    // An unreadable project name pushes nothing rather than an untitled banner.
    expect(buildPushPayload(emptyPushContext(), rowOf("smart_assign_batch"), "en")).toBeNull();
  });

  it("pushes a Numo note in its own words, mentions as labels, nothing when unreadable", () => {
    const ctx = ctxWithIssue();
    ctx.numoNotes.set("note-1", {
      title: "Release blocked",
      body: "The check failed on [@MIN-42](mention:issue/22222222-2222-2222-2222-222222222222).",
    });
    expect(buildPushPayload(ctx, rowOf("numo_message"), "fr")).toMatchObject({
      title: "Numo",
      body: "Release blocked\nThe check failed on MIN-42.",
      url: `/projects/${PROJECT.slice(0, 8)}?issue=${ISSUE.slice(0, 8)}`,
      tag: "numo-note:note-1",
    });
    expect(buildPushPayload(ctx, { ...rowOf("numo_message"), numo_note_id: "missing" }, "en")).toBeNull();
  });

  // Pushing nothing beats opening a blank screen: a trashed target (MIN-133)
  // leaves the hydration, and so the push.
  it("pushes nothing when the target is gone or there is no project", () => {
    expect(buildPushPayload(emptyPushContext(), issueRow("comment"), "fr")).toBeNull();
    expect(buildPushPayload(ctxWithIssue(), issueRow("comment", { project_id: null }), "fr")).toBeNull();
  });

  it("labels the issue by its title when the project key is missing", () => {
    const ctx = ctxWithIssue();
    ctx.projectKeys.clear();
    expect(buildPushPayload(ctx, issueRow("mention"), "en")!.body)
      .toBe("Mentioned you in Réparer le sélecteur de cycle\nRéparer le sélecteur de cycle");
  });
});

describe("toPushLocale", () => {
  it("normalizes every supported regional locale and defaults to English", () => {
    expect(toPushLocale("fr")).toBe("fr");
    expect(toPushLocale("fr-FR")).toBe("fr");
    expect(toPushLocale("FR")).toBe("fr");
    expect(toPushLocale("en-US")).toBe("en");
    expect(toPushLocale("de-DE")).toBe("de");
    expect(toPushLocale("pt-BR")).toBe("pt-BR");
    expect(toPushLocale("it-IT")).toBe("it");
    expect(toPushLocale("es-MX")).toBe("es");
    expect(toPushLocale(null)).toBe("en");
    expect(toPushLocale("")).toBe("en");
  });
});

describe("loadPushContext", () => {
  /** Minimal Supabase client: `from(table).select().in().is()` is a thenable
 * that renders prepared rows for this table. */
  function stubService(
    tables: Record<string, unknown[]>,
    seen: string[] = []
  ): SupabaseClient {
    const builder = (table: string) => {
      const result = { data: tables[table] ?? [], error: null };
      const chain: Record<string, unknown> = {
        select: () => chain,
        in: () => chain,
        is: () => chain,
        then: (resolve: (v: typeof result) => unknown) => Promise.resolve(resolve(result)),
      };
      return chain;
    };
    return {
      from: (table: string) => {
        seen.push(table);
        return builder(table);
      },
      auth: { admin: { getUserById: vi.fn() } },
    } as unknown as SupabaseClient;
  }

  it("reads nothing for an empty batch", async () => {
    const seen: string[] = [];
    const ctx = await loadPushContext(stubService({}, seen), []);
    expect(seen).toEqual([]);
    expect(ctx.issues.size).toBe(0);
  });

  it("reads only the tables the batch needs, once each", async () => {
    const seen: string[] = [];
    const service = stubService(
      {
        issues: [{ id: ISSUE, number: 42, title: "Réparer le sélecteur" }],
        projects: [{ id: PROJECT, key: "MIN" }],
      },
      seen
    );
    // Two recipients, one ticket: one reading of `issues`, not two.
    const ctx = await loadPushContext(service, [
      issueRow("mention", { actor_id: null }),
      issueRow("mention", { actor_id: null, user_id: "u2" } as Partial<NotificationRow>),
    ]);
    expect(seen.sort()).toEqual(["issues", "projects"]);
    expect(ctx.issues.get(ISSUE)).toEqual({ number: 42, title: "Réparer le sélecteur" });
    expect(ctx.projectKeys.get(PROJECT)).toBe("MIN");

    // And the payload is built from this context.
    expect(buildPushPayload(ctx, issueRow("mention", { actor_id: null }), "en")).toMatchObject(
      { title: en.Inbox.someone, body: "Mentioned you in MIN-42\nRéparer le sélecteur" }
    );
  });
});
