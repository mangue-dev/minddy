// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsContext } from "./projects-context-store";
import type { ProjectsContextValue } from "./projects-context";
import { projectBoardKeys, categoriesKey, issueRelationsKey, issuesKey, membersKey, objectivesKey } from "./query-keys";
import { useIssuePanelData, type IssuePanelBoardData } from "./use-issue-panel-data";
import type { Category, Issue, IssueRelation, Member, MembersResponse, Objective } from "./types";

vi.mock("./auth-context", () => ({ useAuth: () => ({ user: { id: "viewer" } }) }));

const PROJECT = "project";
const issue = { id: "issue", project_id: PROJECT, number: 1, title: "Issue" } as Issue;
const member = { user_id: "viewer" } as Member;
const category = { id: "category", name: "Bug" } as Category;
const objective = { id: "objective", name: "Launch" } as Objective;
const relation = { id: "relation", source_id: "issue", target_id: "issue-2", type: "blocks" } as IssueRelation;
const projects = { projects: [{ id: PROJECT, key: "MIN" }] } as unknown as ProjectsContextValue;

let client: QueryClient;
let root: Root;
let data: ReturnType<typeof useIssuePanelData>;

/** The project collections whose read was started (this harness has no
    session, so a started read fails at once). */
const readsStarted = () => projectBoardKeys(PROJECT)
  .filter((key) => {
    const state = client.getQueryState(key);
    return !!state && (state.fetchStatus === "fetching" || state.errorUpdateCount > 0 || state.dataUpdateCount > 1);
  })
  .map((key) => key[0]);

function Harness({ projectId, board }: { projectId: string | null; board?: IssuePanelBoardData }) {
  data = useIssuePanelData(projectId, board);
  return null;
}

async function mount(projectId: string | null, board?: IssuePanelBoardData) {
  await act(() => root.render(createElement(QueryClientProvider, { client },
    createElement(ProjectsContext.Provider, { value: projects },
      createElement(Harness, { projectId, board })))));
}

function seedProjectBoard() {
  client.setQueryData(issuesKey(PROJECT), [issue]);
  client.setQueryData(issueRelationsKey(PROJECT), [relation]);
  client.setQueryData<MembersResponse>(membersKey(PROJECT), {
    members: [member], invitations: [], isOwner: true, myRole: "owner", canComment: true,
  } as MembersResponse);
  client.setQueryData(categoriesKey(PROJECT), [category]);
  client.setQueryData(objectivesKey(PROJECT), [objective]);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  vi.unstubAllGlobals();
});

describe("useIssuePanelData", () => {
  it("reads the project a board already loaded from the shared caches, without a request", async () => {
    seedProjectBoard();
    await mount(PROJECT);
    expect(data).toMatchObject({
      projectKey: "MIN",
      allIssues: [issue],
      relations: [relation],
      members: [member],
      categories: [category],
      objectives: [objective],
    });
    expect(readsStarted()).toEqual([]);
  });

  it("loads the issue's project itself when nothing holds it yet", async () => {
    await mount(PROJECT);
    expect(readsStarted()).toEqual(expect.arrayContaining(["issues", "members", "categories", "objectives", "issue-relations"]));
  });

  it("shows the rows a cross-project board hands over and reads nothing more", async () => {
    const board: IssuePanelBoardData = {
      scope: "global",
      forProject: (projectId) => projectId === PROJECT
        ? { members: [member], categories: [category], objectives: [objective], issues: [issue], relations: [relation] }
        : undefined,
    };
    await mount(PROJECT, board);
    expect(data).toMatchObject({ allIssues: [issue], relations: [relation], members: [member] });
    expect(readsStarted()).toEqual([]);
  });

  it("reads nothing while the panel is mounted without an issue", async () => {
    await mount(null);
    expect(data.allIssues).toEqual([]);
    expect(client.getQueryCache().getAll().some((query) => query.state.fetchStatus !== "idle" || query.state.errorUpdateCount > 0)).toBe(false);
  });
});
