import { afterEach, describe, expect, it } from "vitest";
import {
  applyPendingBoard,
  applyPendingIssues,
  issueWrites,
  objectiveWrites,
} from "./issue-writes";
import type { GlobalBoardResponse, Issue, Objective } from "../types";

// Registers are singletons shared by the entire application: one
// entry left open would distort the following test.
afterEach(() => {
  issueWrites.reset();
  objectiveWrites.reset();
});

const issue = (id: string, projectId: string): Issue =>
  ({ id, project_id: projectId, status: "todo" }) as Issue;

const objective = (id: string, projectId: string, name: string): Objective =>
  ({ id, project_id: projectId, name, status: "planned" }) as Objective;

const board = (
  issues: Issue[],
  objectives: Record<string, Objective[]>
): GlobalBoardResponse => ({ issues, objectives }) as GlobalBoardResponse;

describe("applyPendingIssues", () => {
  // The register does not know the project of the list presented to it: without
  // rescoping, a creation still in flight in a project was added to the
  // response from another (preloading on hover, real-time refetch, etc.).
  it("n'ajoute pas la création en vol d'un autre projet", () => {
    const startedAt = Date.now();
    issueWrites.begin({ kind: "insert", row: issue("new", "A") });

    expect(
      applyPendingIssues([issue("b1", "B")], startedAt, "B").map((i) => i.id)
    ).toEqual(["b1"]);
    expect(
      applyPendingIssues([issue("a1", "A")], startedAt, "A").map((i) => i.id)
    ).toEqual(["a1", "new"]);
  });

  // A patch designates a ticket by its id: it cannot make the wrong list,
  // and rescoping must not cost it the identity of the table (react-query
  // reuses the reference when nothing has changed).
  it("leaves the array unchanged when no write applies", () => {
    const rows = [issue("b1", "B")];
    expect(applyPendingIssues(rows, Date.now(), "B")).toBe(rows);
  });
});

describe("applyPendingBoard", () => {
  // The cross-project board carries its copy of the objectives: a partial answer
  // before the PATCH it replayed the old name on the /all card chips.
  it("also overlays objective writes, project by project", () => {
    const startedAt = Date.now();
    objectiveWrites.begin({
      kind: "patch",
      id: "o1",
      patch: { name: "Refonte" },
    });

    const untouched = [objective("o2", "B", "Autre")];
    const payload = board([], { A: [objective("o1", "A", "Avant")], B: untouched });
    const next = applyPendingBoard(payload, startedAt);

    expect(next.objectives.A[0].name).toBe("Refonte");
    // The project that nothing touches keeps its table — react-query reuses the
    // reference when it hasn't moved.
    expect(next.objectives.B).toBe(untouched);
  });

  it("rend la charge d'origine quand rien n'est en attente", () => {
    const payload = board([issue("a1", "A")], { A: [objective("o1", "A", "Avant")] });
    expect(applyPendingBoard(payload, Date.now())).toBe(payload);
  });
});
