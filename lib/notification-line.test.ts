import { describe, expect, it } from "vitest";
import { notificationActor, notificationTitle } from "./notification-line";
import { notificationLineKey } from "./notification-target";
import type { MyNotification } from "./types";

const LABELS = {
  someone: "Quelqu'un",
  mcpFallback: "Un agent",
  somePageFallback: "Page sans titre",
  someIssueFallback: "un ticket",
  instanceConfigTitle: "Variables de l’instance",
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
  it("names Smart Assign before anything else", () => {
    const n = notification({ via_smart_assign: true, actor_name: "Léa" });
    expect(notificationActor(n, LABELS)).toBe("Smart Assign");
  });

  it("names the MCP agent, and its fallback when the key has no name", () => {
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

  it("names the human, and falls back to “someone” without an actor", () => {
    expect(
      notificationActor(notification({ actor_name: "Léa" }), LABELS)
    ).toBe("Léa");
    expect(notificationActor(notification({}), LABELS)).toBe("Quelqu'un");
  });
});

describe("notificationLineKey", () => {
  it("uses the reply wording for Numo comments", () => {
    expect(notificationLineKey("comment", true)).toBe("lineNumoReply");
    expect(notificationLineKey("comment", false)).toBe("lineComment");
  });
});

describe("notificationTitle", () => {
  it("takes the objective before the context ticket", () => {
    const n = notification({
      objective_id: "o1",
      objective_name: "Refonte",
      issue_id: "i1",
      issue_title: "Un ticket",
    });
    expect(notificationTitle(n, LABELS)).toBe("Refonte");
  });

  it("names each target by what it has", () => {
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

  it("gives a title to a page that has none", () => {
    expect(
      notificationTitle(notification({ page_id: "pg1", page_title: "" }), LABELS)
    ).toBe("Page sans titre");
  });

  it("names an instance-wide change by its subject, never as a ticket", () => {
    expect(
      notificationTitle(notification({ type: "instance_config_changed" }), LABELS)
    ).toBe("Variables de l’instance");
  });

  it("falls back when the ticket has no title", () => {
    expect(notificationTitle(notification({ issue_id: "i1" }), LABELS)).toBe(
      "un ticket"
    );
  });
});
