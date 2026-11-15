import { describe, expect, it } from "vitest";
import { sharedMembers, writableSelection } from "./global-board-selection";
import type { Member } from "./types";

const member = (user_id: string) => ({ user_id, name: user_id }) as unknown as Member;
const members = (...ids: string[]) => new Map(ids.map((id) => [id, member(id)]));

describe("cross-project selection", () => {
  // A reader could lasso or ⇧-click cards of a read-only project and bulk-edit
  // them; the server refused and every optimistic patch flashed back.
  it("leaves the cards of read-only projects out of the selection", () => {
    const issues = new Map([
      ["mine", { project_id: "writable" }],
      ["theirs", { project_id: "read-only" }],
    ]);
    const selected = writableSelection(["mine", "theirs", "gone"], issues, (id) => id === "writable");
    expect([...selected]).toEqual(["mine"]);
  });

  // The bulk assignee list concatenated every project's members: a person in
  // two projects appeared twice, and people outside the selection's projects
  // were offered.
  it("offers each assignee once, only from the projects the selection spans", () => {
    const byProject = new Map([
      ["a", members("ana", "bo")],
      ["b", members("bo", "cy")],
      ["c", members("dee")],
    ]);
    expect(sharedMembers([{ project_id: "a" }, { project_id: "a" }], byProject).map((m) => m.user_id)).toEqual(["ana", "bo"]);
    expect(sharedMembers([{ project_id: "a" }, { project_id: "b" }], byProject).map((m) => m.user_id)).toEqual(["bo"]);
    expect(sharedMembers([], byProject)).toEqual([]);
  });
});
