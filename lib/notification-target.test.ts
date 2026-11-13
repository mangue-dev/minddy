import { describe, expect, it } from "vitest";

import { notificationTargetPath } from "./notification-target";

const P = "11111111-1111-1111-1111-111111111111";

describe("notificationTargetPath", () => {
  it("opens the objective when the row points at one", () => {
    expect(
      notificationTargetPath({ project_id: P, issue_id: null, objective_id: "obj" })
    ).toBe(`/projects/${P.slice(0, 8)}/objectives?open=obj`);
  });

  it("opens the board post when the row points at one", () => {
    expect(
      notificationTargetPath({ project_id: P, issue_id: null, feedback_post_id: "fp" })
    ).toBe(`/projects/${P.slice(0, 8)}/feedback?post=fp`);
  });

  it("opens the ticket in its board", () => {
    expect(notificationTargetPath({ project_id: P, issue_id: "iss" })).toBe(
      `/projects/${P.slice(0, 8)}?issue=iss`
    );
  });

  // The order of priority is the contract: a goal line that drags a
  // context `issue_id` should open the GOAL, not the ticket.
  it("prefers the objective over the post, and the post over the issue", () => {
    expect(
      notificationTargetPath({
        project_id: P,
        issue_id: "iss",
        objective_id: "obj",
        feedback_post_id: "fp",
      })
    ).toBe(`/projects/${P.slice(0, 8)}/objectives?open=obj`);
    expect(
      notificationTargetPath({ project_id: P, issue_id: "iss", feedback_post_id: "fp" })
    ).toBe(`/projects/${P.slice(0, 8)}/feedback?post=fp`);
  });

  // MIN-278: the page has its own route, and its BLOCK is a fragment — it does not
  // does not go to the server, does not break any route, and this is already the form of
  // block links (`blockLink`). Without it, clicking opens a document of three
  // screens at the top, on a quote placed in the middle.
  it("opens the page and its block when the mention identifies one", () => {
    expect(notificationTargetPath({ project_id: P, issue_id: null, page_id: "pg" })).toBe(
      `/projects/${P.slice(0, 8)}/pages/pg`
    );
    expect(
      notificationTargetPath({
        project_id: P,
        issue_id: null,
        page_id: "pg",
        block_id: "b2",
      })
    ).toBe(`/projects/${P.slice(0, 8)}/pages/pg#b2`);
  });

  it("goes nowhere without a project or target", () => {
    expect(notificationTargetPath({ project_id: null, issue_id: "iss" })).toBeNull();
    expect(notificationTargetPath({ project_id: P, issue_id: null })).toBeNull();
  });

  it("opens the project for a Numo note without a link, and the link otherwise", () => {
    expect(notificationTargetPath({ type: "numo_message", project_id: P, issue_id: null }))
      .toBe(`/projects/${P.slice(0, 8)}`);
    expect(notificationTargetPath({ type: "numo_message", project_id: P,
      issue_id: null, page_id: "pg" })).toBe(`/projects/${P.slice(0, 8)}/pages/pg`);
  });
});

describe("a backfill line (MIN-903)", () => {
  it("opens the project that holds the assigned issues", () => {
    expect(notificationTargetPath({ type: "smart_assign_batch", project_id: P, issue_id: null }))
      .toBe(`/projects/${P.slice(0, 8)}`);
  });
});
