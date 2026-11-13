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

/** The banner names its actor in its title (MIN-975). */
const actorOf = (source: Partial<NotificationRow>): string =>
  buildPushPayload(context(), commentRow(source), "fr")!.title;

describe("notificationActorSource", () => {
  it("sets nothing for a human gesture: the banner names the person", () => {
    expect(notificationActorSource({})).toEqual({});
    expect(notificationActorSource({ viaAssistant: false, mcpKeyId: null })).toEqual({});
    expect(actorOf(notificationActorSource({}))).toBe("Clément");
  });

  it("names Numo for an agent's gesture, not the account that allowed it", () => {
    const source = notificationActorSource({ viaAssistant: true });
    expect(source).toEqual({ via_assistant: true });
    expect(actorOf(source)).toBe("Numo");
  });

  it("names the key's agent when the write came through MCP", () => {
    const source = notificationActorSource({ mcpKeyId: "k1" });
    expect(source).toEqual({ via_mcp: true, api_key_id: "k1" });

    const actor = actorOf(source);
    expect(actor).toContain("Claude Code");
    expect(actor).not.toContain("Clément");
    expect(actor).not.toContain(fr.Inbox.someone);
  });

  it("never sets both flags: the key wins, since it has a name", () => {
    // The display tests `via_assistant` before `via_mcp` (like the timeline):
    // carrying both would say “Numo” for a gesture whose agent is known by name.
    const source = notificationActorSource({ viaAssistant: true, mcpKeyId: "k1" });
    expect(source.via_assistant).toBeUndefined();
    expect(actorOf(source)).toContain("Claude Code");
  });
});
