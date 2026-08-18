import { describe, expect, it } from "vitest";

import { updateDraftTool } from "@/app/api/projects/[id]/dictate-issue/route";

/**
 * UNDER SMART-FILL, THE DICTATION NO LONGER SET THE FOUR PROPERTIES (MIN-260).
 *
 * The form no longer shows them, and the server only fills in what is
 * empty: a dictation which set them still wrote values invisibles
 * WHO WON on Smart-fill — the automation that we thought was armed no longer did
 * do anything, without anything saying so.
 *
 * The fields are removed from the SCHEMA rather than filtered from the response: un
 * argument that we do not propose is neither completed, nor reasoned, nor invoiced. None
 * of all this is seen on the screen, hence this test.
 */

const SMART_FILLED = ["priority", "effort", "objective_id", "category_ids"];
const KEPT = ["title", "description", "status", "assignee_id", "due_date"];

function properties(smartFill: boolean): string[] {
  return Object.keys(updateDraftTool(smartFill).function.parameters.properties);
}

describe("updateDraftTool", () => {
  it("offers all fields when Smart-fill is disabled", () => {
    const keys = properties(false);
    for (const field of [...SMART_FILLED, ...KEPT]) expect(keys).toContain(field);
  });

  it("removes the four Smart-fill fields when it is enabled", () => {
    const keys = properties(true);
    for (const field of SMART_FILLED) expect(keys).not.toContain(field);
  });

  it("keeps the fields left to dictation: title, description, status, assignee, due date", () => {
    // These three are not Smart-fill (they say an intention, not a
    // content): losing them would mean making dictation silent on the essential.
    const keys = properties(true);
    for (const field of KEPT) expect(keys).toContain(field);
  });

  it("does not mutate the shared tool — two consecutive dictations, two correct schemas", () => {
    // `updateDraftTool` starts from a module constant: a `delete` on the object
    // original would cut all subsequent dictations from the process, including
    // those of users who do not have Smart-fill.
    updateDraftTool(true);
    expect(properties(false)).toContain("priority");
  });
});
