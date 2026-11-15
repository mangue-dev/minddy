import { describe, expect, it } from "vitest";
import {
  boardObjectives,
  boardPromptInput,
  multiProjectBoard,
  selectionProjectId,
  sharedMembers,
  singleProjectBoard,
  writableSelection,
} from "./board-projects";
import type { Category, Issue, Member, Objective, Project } from "./types";

const member = (user_id: string) => ({ user_id, name: user_id }) as unknown as Member;
const category = (id: string, name: string) => ({ id, name }) as Category;
const objective = (id: string, project_id: string, name = id) =>
  ({ id, project_id, name, status: "planned" }) as Objective;
const project = (id: string, key: string) => ({ id, key }) as Project;
const issue = (id: string, project_id: string, number: number, extra: Partial<Issue> = {}) =>
  ({ id, project_id, number, title: id, category_ids: [], resource_count: 0, ...extra }) as Issue;

const board = multiProjectBoard(
  [project("a", "AAA"), project("b", "BBB"), project("c", "CCC")],
  { a: [member("ana"), member("bo")], b: [member("bo"), member("cy")], c: [member("dee")] },
  { a: [category("ui", "UI"), category("bug", "Bug")] },
  { a: [objective("goal", "a", "Accessible workspace")], b: [objective("other-goal", "b")] },
);

describe("board projects", () => {
  it("resolves the one project of a project board, without an origin chip", () => {
    const single = singleProjectBoard(project("a", "AAA"), [member("ana")], [], []);
    expect(single.projectId).toBe("a");
    expect(single.byId.get("a")!.key).toBe("AAA");
    expect(single.byId.get("a")!.chip).toBeUndefined();
    expect([...single.byId.get("a")!.members.keys()]).toEqual(["ana"]);
  });

  it("gives each project of a cross-project board its chip, and empty lists when it has none", () => {
    expect(board.projectId).toBeNull();
    expect(board.byId.get("c")).toMatchObject({ key: "CCC", chip: { id: "c" } });
    expect(board.byId.get("c")!.categories.size).toBe(0);
    expect([...boardObjectives(board).keys()]).toEqual(["goal", "other-goal"]);
  });

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

  it("names the selection's project only while the whole selection shares it", () => {
    expect(selectionProjectId([])).toBeNull();
    expect(selectionProjectId([{ project_id: "a" }, { project_id: "a" }])).toBe("a");
    expect(selectionProjectId([{ project_id: "a" }, { project_id: "b" }])).toBeNull();
  });

  // The bulk assignee list concatenated every project's members: a person in
  // two projects appeared twice, and people outside the selection's projects
  // were offered.
  it("offers each assignee once, only from the projects the selection spans", () => {
    const ids = (selected: Array<{ project_id: string }>) =>
      sharedMembers(selected, board).map((m) => m.user_id);
    expect(ids([{ project_id: "a" }, { project_id: "a" }])).toEqual(["ana", "bo"]);
    expect(ids([{ project_id: "a" }, { project_id: "b" }])).toEqual(["bo"]);
    expect(ids([])).toEqual([]);
  });
});

describe("board selection prompt", () => {
  const source = issue("source", "a", 4, { category_ids: ["bug", "ui"] });
  const sameProject = issue("same", "a", 7);
  const elsewhere = issue("elsewhere", "b", 9);
  const issueById = new Map([source, sameProject, elsewhere].map((i) => [i.id, i]));

  // On /all the categories followed the issue's own id order, unlike the
  // project board's project order (MIN-760).
  it("lists categories in the project's order", () => {
    expect(boardPromptInput(source, board, [], issueById).categories).toEqual(["UI", "Bug"]);
  });

  // The project board printed an end it did not hold as "AAA-0".
  it("names each relation end in its own project, and an unknown end as empty", () => {
    const input = boardPromptInput(source, board, [
      { relation: "blocks", otherId: "same", otherType: "issue" },
      { relation: "related", otherId: "elsewhere", otherType: "issue" },
      { relation: "blocked_by", otherId: "missing", otherType: "issue" },
      { relation: "blocks", otherId: "goal", otherType: "objective" },
    ], issueById);
    expect(input).toMatchObject({ projectId: "a", projectKey: "AAA" });
    expect(input.relations).toEqual([
      expect.objectContaining({ identifier: "AAA-7", title: "same" }),
      expect.objectContaining({ identifier: "BBB-9", title: "elsewhere" }),
      expect.objectContaining({ identifier: "", title: "" }),
      expect.objectContaining({ objective: true, identifier: "", title: "Accessible workspace" }),
    ]);
  });
});
