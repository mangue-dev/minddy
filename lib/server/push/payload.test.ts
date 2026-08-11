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
 * La charge utile poussée doit dire EXACTEMENT ce que dit la ligne d'inbox — au
 * mot près, dans les deux langues. Le test passe donc par le VRAI formateur sur
 * les vrais catalogues : il attrape aussi bien une clé absente (qui rendrait
 * « Inbox.… ») qu'un `{actor}` non substitué, les deux fautes que le typage
 * laisse passer (cf. CLAUDE.md).
 */

const PROJECT = "11111111-1111-1111-1111-111111111111";
const ISSUE = "22222222-2222-2222-2222-222222222222";
const ACTOR = "33333333-3333-3333-3333-333333333333";

const ALL_TYPES: readonly NotificationType[] = [
  "assigned",
  "mention",
  "comment",
  "agent_done",
  "agent_question",
  "agent_failed",
  "feedback_new",
  "pr_reviewed",
  "pr_merged",
  "pr_opened",
  "automation_paused",
  "automation_stopped",
  "routine_done",
  "page_mention",
  "page_agent_edit",
];

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

describe("buildPushPayload", () => {
  it.each(ALL_TYPES)("rend une phrase substituée en EN et en FR — %s", (type) => {
    const ctx = ctxWithIssue();
    for (const locale of ["en", "fr"] as const) {
      const payload = buildPushPayload(ctx, issueRow(type), locale);
      expect(payload).not.toBeNull();
      expect(payload!.body).not.toContain("Inbox.");
      expect(payload!.body).not.toContain("{actor}");
      expect(payload!.body.trim()).not.toBe("");
    }
  });

  it("titre = référence + titre du ticket, destination = le board", () => {
    const payload = buildPushPayload(ctxWithIssue(), issueRow("comment"), "fr");
    expect(payload).toEqual({
      title: "MIN-42 · Réparer le sélecteur de cycle",
      body: fr.Inbox.lineComment.replace("{actor}", "Alice"),
      url: `/projects/${PROJECT}?issue=${ISSUE}`,
      tag: `/projects/${PROJECT}?issue=${ISSUE}`,
    });
  });

  it("nomme l'acteur, et retombe sur « Quelqu'un » / « Someone » sans lui", () => {
    const withActor = buildPushPayload(ctxWithIssue(), issueRow("mention"), "en");
    expect(withActor!.body).toBe(en.Inbox.lineMention.replace("{actor}", "Alice"));

    // Acteur inconnu du contexte (compte supprimé) : le repli est TRADUIT.
    const anonCtx = ctxWithIssue("");
    expect(buildPushPayload(anonCtx, issueRow("mention"), "en")!.body).toBe(
      en.Inbox.lineMention.replace("{actor}", en.Inbox.someone)
    );
    expect(buildPushPayload(anonCtx, issueRow("mention"), "fr")!.body).toBe(
      fr.Inbox.lineMention.replace("{actor}", fr.Inbox.someone)
    );
  });

  it("nomme Smart Assign et l'agent MCP plutôt que « Quelqu'un »", () => {
    const ctx = ctxWithIssue("");
    ctx.apiKeyActors.set("k1", { name: "Claude Code (mcp)", agent: "claude" });

    const smart = buildPushPayload(
      ctx,
      issueRow("assigned", { actor_id: null, via_smart_assign: true }),
      "fr"
    );
    expect(smart!.body).toContain("Smart Assign");

    const mcp = buildPushPayload(
      ctx,
      issueRow("comment", { actor_id: null, via_mcp: true, api_key_id: "k1" }),
      "fr"
    );
    expect(mcp!.body).toContain("Claude Code");
    expect(mcp!.body).not.toContain(fr.Inbox.someone);
  });

  it("nomme Numo d'une citation posée par l'agent dans une page", () => {
    // MIN-278 : le geste est passé sous le compte qui l'a permis, mais c'est
    // l'agent qui a écrit la phrase. Sans ce drapeau, la bannière annoncerait à
    // Bob que Clément l'a mentionné — ce que Clément n'a pas fait.
    const ctx = ctxWithIssue();
    ctx.pages.set("pg", "Décisions produit");

    const numo = buildPushPayload(
      ctx,
      issueRow("page_mention", {
        issue_id: null,
        page_id: "pg",
        block_id: "b2",
        via_assistant: true,
      }),
      "fr"
    );
    expect(numo).toEqual({
      title: "Décisions produit",
      body: fr.Inbox.linePageMention.replace("{actor}", "Numo"),
      url: `/projects/${PROJECT}/pages/pg#b2`,
      tag: `/projects/${PROJECT}/pages/pg#b2`,
    });

    // Par le MCP, on connaît son NOM : c'est lui qui s'affiche, pas « Numo ».
    ctx.apiKeyActors.set("k1", { name: "Claude Code (mcp)", agent: "claude" });
    const mcp = buildPushPayload(
      ctx,
      issueRow("page_mention", {
        issue_id: null,
        page_id: "pg",
        via_mcp: true,
        api_key_id: "k1",
      }),
      "fr"
    );
    expect(mcp!.body).toContain("Claude Code");
  });

  it("suit la cible : objectif, retour de board, pull request, ticket", () => {
    const ctx = ctxWithIssue();
    ctx.objectives.set("obj", "Refonte de l'inbox");
    ctx.feedbackPosts.set("fp", "Mode sombre s'il vous plaît");
    ctx.pullRequests.set("pr", { number: 12, title: "Ajouter le mode sombre" });

    const objective = buildPushPayload(
      ctx,
      issueRow("comment", { issue_id: null, objective_id: "obj" }),
      "fr"
    );
    expect(objective).toMatchObject({
      title: "Refonte de l'inbox",
      url: `/projects/${PROJECT}/objectives?open=obj`,
    });

    const feedback = buildPushPayload(
      ctx,
      issueRow("feedback_new", { issue_id: null, feedback_post_id: "fp" }),
      "fr"
    );
    expect(feedback).toMatchObject({
      title: "Mode sombre s'il vous plaît",
      url: `/projects/${PROJECT}/feedback?post=fp`,
    });

    // Une PR ouverte mène à la page Pull requests, qui n'est pas dans un projet.
    const pr = buildPushPayload(
      ctx,
      issueRow("pr_opened", { issue_id: null, pull_request_id: "pr" }),
      "fr"
    );
    expect(pr).toMatchObject({
      title: "#12 · Ajouter le mode sombre",
      url: "/pull-requests?pr=pr",
    });
  });

  // Ne rien pousser vaut mieux qu'ouvrir un écran vide : la cible mise à la
  // corbeille (MIN-133) sort de l'hydratation, donc du push.
  it("ne pousse rien quand la cible a disparu ou qu'il n'y a pas de projet", () => {
    expect(buildPushPayload(emptyPushContext(), issueRow("comment"), "fr")).toBeNull();
    expect(
      buildPushPayload(ctxWithIssue(), issueRow("comment", { project_id: null }), "fr")
    ).toBeNull();
  });

  it("tombe sur le titre nu quand la clé de projet manque", () => {
    const ctx = ctxWithIssue();
    ctx.projectKeys.clear();
    expect(buildPushPayload(ctx, issueRow("comment"), "fr")!.title).toBe(
      "Réparer le sélecteur de cycle"
    );
  });
});

describe("toPushLocale", () => {
  it("ramène toute variante française sur `fr`, le reste sur `en`", () => {
    expect(toPushLocale("fr")).toBe("fr");
    expect(toPushLocale("fr-FR")).toBe("fr");
    expect(toPushLocale("FR")).toBe("fr");
    expect(toPushLocale("en-US")).toBe("en");
    expect(toPushLocale(null)).toBe("en");
    expect(toPushLocale("")).toBe("en");
  });
});

describe("loadPushContext", () => {
  /** Client Supabase minimal : `from(table).select().in().is()` est un thenable
   *  qui rend les lignes préparées pour cette table. */
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

  it("ne lit rien sur un lot vide", async () => {
    const seen: string[] = [];
    const ctx = await loadPushContext(stubService({}, seen), []);
    expect(seen).toEqual([]);
    expect(ctx.issues.size).toBe(0);
  });

  it("n'interroge que les tables dont le lot a besoin, une fois chacune", async () => {
    const seen: string[] = [];
    const service = stubService(
      {
        issues: [{ id: ISSUE, number: 42, title: "Réparer le sélecteur" }],
        projects: [{ id: PROJECT, key: "MIN" }],
      },
      seen
    );
    // Deux destinataires, un seul ticket : une lecture de `issues`, pas deux.
    const ctx = await loadPushContext(service, [
      issueRow("mention", { actor_id: null }),
      issueRow("mention", { actor_id: null, user_id: "u2" } as Partial<NotificationRow>),
    ]);
    expect(seen.sort()).toEqual(["issues", "projects"]);
    expect(ctx.issues.get(ISSUE)).toEqual({ number: 42, title: "Réparer le sélecteur" });
    expect(ctx.projectKeys.get(PROJECT)).toBe("MIN");

    // Et la charge utile se construit bien à partir de ce contexte-là.
    expect(buildPushPayload(ctx, issueRow("mention", { actor_id: null }), "en")).toMatchObject(
      { title: "MIN-42 · Réparer le sélecteur" }
    );
  });
});
