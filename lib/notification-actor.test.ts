import { describe, expect, it } from "vitest";

import { notificationActorSource } from "./notification-actor";
import {
  buildPushPayload,
  emptyPushContext,
  type PushContext,
} from "@/lib/server/push/payload";
import type { NotificationRow } from "@/lib/server/notifications";
import fr from "@/messages/fr.json";

/**
 * What this test protects is not the three-line `if`, it's the SECOND
 * SURFACE.
 *
 * A comment written by an agent had its flag on the line of
 * comment, and the inbox read it there (app/api/notifications/route.ts). The
 * push notification only reads the notification line: without these
 * fields, the same writing announced "Numo commented" in the app and
 * “Clément commented” on Clément's phone — a notification from
 * yourself, for a text that you don't have written.
 *
 * Hence the form of the test: we pass the helper output to the REAL constructor of
 * payload, and we check the name that comes out.
 */

const PROJECT = "11111111-1111-1111-1111-111111111111";
const ISSUE = "22222222-2222-2222-2222-222222222222";
/** The account under which the entry was made — the one that should NOT be named
 when an agent wrote. */
const CLEMENT = "33333333-3333-3333-3333-333333333333";

function context(): PushContext {
  const ctx = emptyPushContext();
  ctx.issues.set(ISSUE, { number: 42, title: "Réparer le sélecteur de cycle" });
  ctx.projectKeys.set(PROJECT, "MIN");
  ctx.actorNames.set(CLEMENT, "Clément");
  ctx.apiKeyActors.set("k1", { name: "Claude Code (mcp)", agent: "claude" });
  return ctx;
}

/** The line as posed by add-comment.ts, description-mentions.ts and
 their neighbors: the `actor_id` of the bearer account, plus the source. */
const commentRow = (source: Partial<NotificationRow>): NotificationRow =>
  ({
    user_id: CLEMENT,
    project_id: PROJECT,
    type: "comment",
    issue_id: ISSUE,
    comment_id: "c1",
    actor_id: CLEMENT,
    ...source,
  }) as NotificationRow;

const bodyOf = (source: Partial<NotificationRow>): string =>
  buildPushPayload(context(), commentRow(source), "fr")!.body;

describe("notificationActorSource", () => {
  it("ne pose rien pour un geste humain — la ligne nomme la personne", () => {
    expect(notificationActorSource({})).toEqual({});
    expect(notificationActorSource({ viaAssistant: false, mcpKeyId: null })).toEqual({});
    expect(bodyOf(notificationActorSource({}))).toContain("Clément");
  });

  it("nomme NUMO d'un geste de l'agent, et pas le compte qui l'a permis", () => {
    const source = notificationActorSource({ viaAssistant: true });
    expect(source).toEqual({ via_assistant: true });

    const body = bodyOf(source);
    expect(body).toContain("Numo");
    expect(body).not.toContain("Clément");
  });

  it("nomme l'agent de la CLÉ quand l'écriture vient du MCP", () => {
    const source = notificationActorSource({ mcpKeyId: "k1" });
    expect(source).toEqual({ via_mcp: true, api_key_id: "k1" });

    const body = bodyOf(source);
    expect(body).toContain("Claude Code");
    expect(body).not.toContain("Clément");
    expect(body).not.toContain(fr.Inbox.someone);
  });

  it("ne cumule JAMAIS les deux drapeaux : la clé l'emporte, elle a un nom", () => {
    // The display tests `via_assistant` before `via_mcp` (like the timeline):
    // wearing them both would make you say “Numo” with a familiar gesture
    // l'agent par son nom.
    const source = notificationActorSource({ viaAssistant: true, mcpKeyId: "k1" });
    expect(source.via_assistant).toBeUndefined();
    expect(bodyOf(source)).toContain("Claude Code");
  });
});
