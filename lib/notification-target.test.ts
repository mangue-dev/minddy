import { describe, expect, it } from "vitest";

import { notificationTargetPath, NOTIFICATION_LINE_KEYS } from "./notification-target";
import en from "@/messages/en.json";

const P = "11111111-1111-1111-1111-111111111111";

describe("notificationTargetPath", () => {
  it("opens an agent conversation even without a ticket", () => {
    expect(
      notificationTargetPath({
        project_id: P,
        issue_id: null,
        agent_conversation_id: "conv",
      }),
    ).toBe("/agents?run=conv");
  });

  it("ouvre l'objectif quand la ligne en porte un", () => {
    expect(
      notificationTargetPath({ project_id: P, issue_id: null, objective_id: "obj" })
    ).toBe(`/projects/${P}/objectives?open=obj`);
  });

  it("ouvre le retour du board quand la ligne en porte un", () => {
    expect(
      notificationTargetPath({ project_id: P, issue_id: null, feedback_post_id: "fp" })
    ).toBe(`/projects/${P}/feedback?post=fp`);
  });

  it("opens the ticket in its board", () => {
    expect(notificationTargetPath({ project_id: P, issue_id: "iss" })).toBe(
      `/projects/${P}?issue=iss`
    );
  });

  // The order of priority is the contract: a goal line that drags a
  // context `issue_id` should open the GOAL, not the ticket.
  it("fait passer l'objectif avant le retour, et le retour avant le ticket", () => {
    expect(
      notificationTargetPath({
        project_id: P,
        issue_id: "iss",
        objective_id: "obj",
        feedback_post_id: "fp",
      })
    ).toBe(`/projects/${P}/objectives?open=obj`);
    expect(
      notificationTargetPath({ project_id: P, issue_id: "iss", feedback_post_id: "fp" })
    ).toBe(`/projects/${P}/feedback?post=fp`);
  });

  // MIN-278: the page has its own route, and its BLOCK is a fragment — it does not
  // does not go to the server, does not break any route, and this is already the form of
  // block links (`blockLink`). Without it, clicking opens a document of three
  // screens at the top, on a quote placed in the middle.
  it("opens the page and its block when the mention identifies one", () => {
    expect(notificationTargetPath({ project_id: P, issue_id: null, page_id: "pg" })).toBe(
      `/projects/${P}/pages/pg`
    );
    expect(
      notificationTargetPath({
        project_id: P,
        issue_id: null,
        page_id: "pg",
        block_id: "b2",
      })
    ).toBe(`/projects/${P}/pages/pg#b2`);
  });

  it("goes nowhere without a project or target", () => {
    expect(notificationTargetPath({ project_id: null, issue_id: "iss" })).toBeNull();
    expect(notificationTargetPath({ project_id: P, issue_id: null })).toBeNull();
  });
});

describe("NOTIFICATION_LINE_KEYS", () => {
  // The `MessageKey<"Inbox">` typing already keeps the promise at compile time;
  // this test also involves building a catalog amputated by hand.
  it("points to keys that really exist in the Inbox namespace", () => {
    for (const key of Object.values(NOTIFICATION_LINE_KEYS)) {
      expect(en.Inbox, `Inbox.${key}`).toHaveProperty(key);
    }
  });
});
