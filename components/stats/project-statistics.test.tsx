// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/en.json";
import type { Issue, IssueRelation, Member, Objective, Project } from "@/lib/types";
import type { PullRequestTimelineEntry } from "@/lib/project-stats";

const mocks = vi.hoisted(() => ({
  issues: [] as Issue[],
  relations: [] as IssueRelation[],
  members: [] as Member[],
  pullRequests: [] as PullRequestTimelineEntry[],
  openIssue: vi.fn(),
  objectives: [] as Objective[],
  push: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: mocks.issues }) }));
vi.mock("@/lib/use-issue-relations-query", () => ({ useIssueRelationsQuery: () => ({ relations: mocks.relations }) }));
vi.mock("@/lib/use-members-query", () => ({ useMembersQuery: () => ({ members: mocks.members }) }));
vi.mock("@/lib/use-project-pull-request-stats", () => ({
  useProjectPullRequestStats: () => ({ pullRequests: mocks.pullRequests, loading: false }),
}));
vi.mock("@/lib/use-objectives-query", () => ({ useObjectivesQuery: () => ({ objectives: mocks.objectives }) }));
vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/issue-panel-context", () => ({ useIssuePanelActions: () => ({ openIssue: mocks.openIssue }) }));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));

import { ProjectStatistics } from "./project-statistics";

const project = { id: "p1", key: "MIN", name: "Minddy" } as Project;
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

function issue(number: number, overrides: Partial<Issue> = {}): Issue {
  return {
    id: `i${number}`,
    project_id: "p1",
    number,
    title: `Issue ${number}`,
    status: "todo",
    assignee_id: null,
    parent_id: null,
    due_date: null,
    created_at: daysAgo(20),
    updated_at: daysAgo(1),
    completed_at: null,
    ...overrides,
  } as Issue;
}

describe("ProjectStatistics", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mocks.openIssue.mockReset();
    mocks.push.mockReset();
    mocks.objectives = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render() {
    await act(async () => {
      root.render(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement(TooltipProvider, null, createElement(ProjectStatistics, { project })),
        }),
      );
    });
  }

  const headings = () => [...container.querySelectorAll("h2")].map((heading) => heading.textContent);

  it("shows every section the project has data for, and opens a graph ticket in the side panel", async () => {
    mocks.issues = [
      issue(1, { status: "done", assignee_id: "u1", completed_at: daysAgo(3) }),
      issue(2, { status: "in_progress", assignee_id: "u1", parent_id: "i1" }),
      issue(3),
    ];
    mocks.relations = [{ id: "r1", source_id: "i2", target_id: "i3", type: "blocks" }];
    mocks.members = [{ user_id: "u1", full_name: "Camille Roy", email: null } as Member];
    mocks.pullRequests = [{ id: "pr1", state: "merged", openedAt: daysAgo(4), mergedAt: daysAgo(3), issueIds: ["i1"] }];
    await render();

    expect(headings()).toEqual(["Momentum", "Where things stand", "Pull requests", "Contributors", "Issue graph"]);
    expect(container.textContent).toContain("Camille Roy");
    // A status segment says its status, its number of issues and its share;
    // the same for the project's breakdown and each contributor.
    expect(container.textContent).toContain("Done: 1 issue, 33%");
    expect(container.textContent).toContain("Done: 1 issue, 50%");
    expect(container.textContent).toContain("100%");

    const node = container.querySelector<SVGCircleElement>('circle[aria-label="MIN-3 Issue 3"]');
    // The done ticket stays out of the graph until closed ones are asked for.
    expect(container.querySelectorAll("circle[role=link]")).toHaveLength(2);
    await act(async () => container.querySelector<HTMLButtonElement>("button[role=switch]")?.click());
    expect(container.querySelectorAll("circle[role=link]")).toHaveLength(3);
    // Directed links point the way they read: parent to sub-issue, blocker to blocked.
    expect(container.querySelectorAll('line[marker-end*="-parent"]')).toHaveLength(1);
    expect(container.querySelectorAll('line[marker-end*="-blocks"]')).toHaveLength(1);
    await act(async () => node?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(mocks.openIssue).toHaveBeenCalledWith("p1", "i3");
  });

  it("leaves out pull requests, contributors and the graph when there is nothing to show", async () => {
    mocks.issues = [issue(1)];
    mocks.relations = [];
    mocks.members = [];
    mocks.pullRequests = [];
    await render();

    expect(headings()).toEqual(["Momentum", "Where things stand"]);
  });

  it("explains that statistics need issues", async () => {
    mocks.issues = [];
    await render();

    expect(container.textContent).toContain("Statistics appear once the project has issues.");
  });

  it("gathers issues in their objective's bubble, whose anchor opens the objective", async () => {
    mocks.issues = [
      issue(1, { objective_id: "o1" }),
      issue(2, { objective_id: "o1" }),
      issue(3),
    ];
    mocks.relations = [
      { id: "r1", source_id: "i1", target_id: "i2", type: "related" },
      { id: "r2", source_id: "i3", target_id: "o1", type: "blocks", target_type: "objective" },
    ];
    mocks.members = [];
    mocks.pullRequests = [];
    mocks.objectives = [{ id: "o1", name: "Search v2", color: "#3b82f6", status: "in_progress" } as Objective];
    await render();

    expect(container.textContent).toContain("Search v2");
    const anchor = container.querySelector<SVGRectElement>('rect[aria-label="Search v2"]');
    expect(anchor).not.toBeNull();
    // An issue outside any objective that blocks it keeps its arrow.
    expect(container.querySelectorAll('line[marker-end*="-blocks"]')).toHaveLength(1);
    await act(async () => anchor?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining("/objectives?open="));
  });
});
