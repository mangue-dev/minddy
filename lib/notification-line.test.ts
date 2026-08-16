import { describe, expect, it } from "vitest";
import { notificationActor, notificationTitle } from "./notification-line";
import type { MyNotification } from "./types";

const LABELS = {
  someone: "Quelqu'un",
  mcpFallback: "Un agent",
  somePageFallback: "Page sans titre",
  someIssueFallback: "un ticket",
  someAgentConversationFallback: "Conversation avec Numo",
};

function notification(patch: Partial<MyNotification>): MyNotification {
  return {
    id: "n1",
    type: "comment",
    read_at: null,
    created_at: "2026-08-13T10:00:00Z",
    issue_id: null,
    issue_number: null,
    issue_title: null,
    objective_id: null,
    objective_name: null,
    feedback_post_id: null,
    feedback_title: null,
    routine_id: null,
    routine_title: null,
    pull_request_id: null,
    pull_request_number: null,
    pull_request_title: null,
    page_id: null,
    ...patch,
  } as MyNotification;
}

describe("notificationActor", () => {
  it("nomme Smart Assign avant tout le reste", () => {
    const n = notification({ via_smart_assign: true, actor_name: "Léa" });
    expect(notificationActor(n, LABELS)).toBe("Smart Assign");
  });

  it("nomme l'agent MCP, et son repli quand la clé n'a pas de nom", () => {
    expect(
      notificationActor(
        notification({ via_mcp: true, api_key_name: "Claude" }),
        LABELS
      )
    ).toContain("Claude");
    expect(
      notificationActor(notification({ via_mcp: true }), LABELS)
    ).toBe("Un agent");
  });

  it("nomme l'humain, et retombe sur « Quelqu'un » sans acteur", () => {
    expect(
      notificationActor(notification({ actor_name: "Léa" }), LABELS)
    ).toBe("Léa");
    expect(notificationActor(notification({}), LABELS)).toBe("Quelqu'un");
  });
});

describe("notificationTitle", () => {
  it("prend l'objectif avant le ticket de contexte", () => {
    const n = notification({
      objective_id: "o1",
      objective_name: "Refonte",
      issue_id: "i1",
      issue_title: "Un ticket",
    });
    expect(notificationTitle(n, LABELS)).toBe("Refonte");
  });

  it("nomme chaque cible par ce qu'elle a", () => {
    expect(
      notificationTitle(
        notification({ feedback_post_id: "f1", feedback_title: "Idée" }),
        LABELS
      )
    ).toBe("Idée");
    expect(
      notificationTitle(
        notification({ routine_id: "r1", routine_title: "Tri du matin" }),
        LABELS
      )
    ).toBe("Tri du matin");
    expect(
      notificationTitle(
        notification({ pull_request_id: "p1", pull_request_title: "Fix" }),
        LABELS
      )
    ).toBe("Fix");
    expect(
      notificationTitle(
        notification({ issue_id: "i1", issue_title: "Réparer le board" }),
        LABELS
      )
    ).toBe("Réparer le board");
  });

  it("donne un titre à une page qui n'en a pas", () => {
    expect(
      notificationTitle(notification({ page_id: "pg1", page_title: "" }), LABELS)
    ).toBe("Page sans titre");
  });

  it("ne fait pas passer une conversation générale sans titre pour un ticket", () => {
    expect(
      notificationTitle(notification({ agent_conversation_id: "c1" }), LABELS)
    ).toBe("Conversation avec Numo");
  });

  it("retombe sur le repli quand le ticket n'a pas de titre", () => {
    expect(notificationTitle(notification({ issue_id: "i1" }), LABELS)).toBe(
      "un ticket"
    );
  });
});
