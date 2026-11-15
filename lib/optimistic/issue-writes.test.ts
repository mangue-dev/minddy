import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyPendingBoard,
  applyPendingIssues,
  findIssueAnywhere,
  issueWrites,
  objectiveWrites,
} from "./issue-writes";
import type { GlobalBoardResponse, Issue, Objective } from "../types";
import { GLOBAL_BOARD_KEY } from "../query-keys";

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
  it("leaves another project's in-flight creation out", () => {
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

describe("findIssueAnywhere", () => {
  it("reads the board on screen rather than a project list left behind", async () => {
    const queryClient = new QueryClient();
    // The project board was visited earlier: its list stays cached, and a
    // teammate's assignment since then only invalidated it.
    queryClient.setQueryData(["issues", "p1"], [{ ...issue("x", "p1"), assignee_id: null }]);
    await queryClient.invalidateQueries({ queryKey: ["issues", "p1"], refetchType: "none" });
    queryClient.setQueryData(GLOBAL_BOARD_KEY, board([{ ...issue("x", "p1"), assignee_id: "teammate" }], {}));
    const unsubscribe = new QueryObserver(queryClient, {
      queryKey: GLOBAL_BOARD_KEY,
      enabled: false,
    }).subscribe(() => {});

    expect(findIssueAnywhere(queryClient, "x")?.assignee_id).toBe("teammate");
    unsubscribe();
  });

  it("falls back to any cache that has the row", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(GLOBAL_BOARD_KEY, board([], {}));
    queryClient.setQueryData(["issues", "p2"], [issue("y", "p2")]);

    expect(findIssueAnywhere(queryClient, "y")?.project_id).toBe("p2");
    expect(findIssueAnywhere(queryClient, "missing")).toBeUndefined();
  });
});
