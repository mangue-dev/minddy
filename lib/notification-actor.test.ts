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
 * Ce que ce test protège n'est pas le `if` de trois lignes, c'est la SECONDE
 * SURFACE.
 *
 * Un commentaire écrit par un agent portait son drapeau sur la ligne de
 * commentaire, et l'inbox le lisait là (app/api/notifications/route.ts). La
 * notification poussée, elle, ne lit que la ligne de notification : sans ces
 * champs, la même écriture s'annonçait « Numo a commenté » dans l'app et
 * « Clément a commenté » sur le téléphone de Clément — une notification de
 * soi-même, pour un texte qu'on n'a pas écrit.
 *
 * D'où la forme du test : on passe la sortie du helper au VRAI constructeur de
 * charge utile, et on vérifie le nom qui en sort.
 */

const PROJECT = "11111111-1111-1111-1111-111111111111";
const ISSUE = "22222222-2222-2222-2222-222222222222";
/** Le compte sous lequel l'écriture est passée — celui qu'il ne faut PAS nommer
    quand c'est un agent qui a écrit. */
const CLEMENT = "33333333-3333-3333-3333-333333333333";

function context(): PushContext {
  const ctx = emptyPushContext();
  ctx.issues.set(ISSUE, { number: 42, title: "Réparer le sélecteur de cycle" });
  ctx.projectKeys.set(PROJECT, "MIN");
  ctx.actorNames.set(CLEMENT, "Clément");
  ctx.apiKeyActors.set("k1", { name: "Claude Code (mcp)", agent: "claude" });
  return ctx;
}

/** La ligne telle que la posent add-comment.ts, description-mentions.ts et
    leurs voisins : l'`actor_id` du compte porteur, plus la source. */
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
    // L'affichage teste `via_assistant` avant `via_mcp` (comme la timeline) :
    // les porter tous les deux ferait dire « Numo » d'un geste dont on connaît
    // l'agent par son nom.
    const source = notificationActorSource({ viaAssistant: true, mcpKeyId: "k1" });
    expect(source.via_assistant).toBeUndefined();
    expect(bodyOf(source)).toContain("Claude Code");
  });
});
