// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { DocumentEditorMentions } from "@/components/editor/document-editor";
import { useDescriptionMentions } from "./use-mention-sources";

type PageRow = { id: string; project_id: string; title: string; icon: string | null; version: number; updated_at: string };

const h = vi.hoisted(() => {
  const issues = [
    { id: "issue-1", project_id: "p", number: 1, title: "Login fails", status: "todo" },
    { id: "issue-9", project_id: "h", number: 9, title: "Archived work", status: "todo" },
  ];
  const objectives = [{ id: "objective-9", project_id: "h", name: "Old launch", color: "blue" }];
  const features = {
    options: [],
    label: () => null,
    detail: () => null,
    arm: () => {},
  };
  return {
    features,
    pages: [] as PageRow[],
    index: { issues, objectives, pages: [] },
    projects: [
      { id: "p", key: "MIN", name: "Minddy", icon_url: null },
      { id: "h", key: "OLD", name: "Old project", icon_url: null },
    ],
    hidden: new Set<string>(),
    // While the exact project caches load, the index rows stand in for them.
    exactLoading: false,
    noIssues: [],
    noObjectives: [],
    armNow: () => {},
    router: { push: () => {} },
    navigation: () => {},
    panel: { openIssue: () => {}, closeIssue: () => {} },
  };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/projects/p/pages/a" }));
vi.mock("@/lib/use-search-index", () => ({ useSearchIndex: () => ({ index: h.index, armNow: h.armNow }) }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({ projects: h.projects }) }));
vi.mock("@/lib/use-issues-query", () => ({ useIssuesQuery: () => ({ issues: h.noIssues, loading: h.exactLoading }) }));
vi.mock("@/lib/use-objectives-query", () => ({ useObjectivesQuery: () => ({ objectives: h.noObjectives, loading: h.exactLoading }) }));
vi.mock("@/lib/use-pages-query", () => ({ usePagesQuery: () => ({ pages: h.pages, loading: false }) }));
vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => h.router, useAppNavigation: () => h.navigation }));
vi.mock("@/lib/issue-panel-context", () => ({ useIssuePanelActions: () => h.panel }));
// The MIN-872 sources load at the first "@" and have their own tests.
vi.mock("@/lib/use-feature-mentions", () => ({
  useFeatureMentions: () => h.features,
}));
vi.mock("@/lib/use-hidden-projects", () => ({ useHiddenProjects: () => ({ hiddenProjectIds: h.hidden }) }));

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; h.hidden = new Set(); h.exactLoading = false; });

const row = (title: string, version: number): PageRow => ({
  id: "a", project_id: "p", title, icon: null, version, updated_at: `2026-10-15T10:00:0${version}Z`,
});

it("keeps the mention catalog through save acknowledgements and rebuilds only page rows on rename", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const members: never[] = [];
  let mentions!: DocumentEditorMentions;
  function Surface() {
    mentions = useDescriptionMentions("p", members);
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  const render = (pages: PageRow[]) => act(async () => { h.pages = pages; root.render(<Surface />); });

  await render([row("Roadmap", 1)]);
  const saved = mentions;
  // A save acknowledgement patches the version and timestamp into a new list.
  await render([row("Roadmap", 2)]);
  expect(mentions).toBe(saved);
  expect(mentions.options).toBe(saved.options);
  expect(mentions.scan).toBe(saved.scan);
  expect(mentions.links).toBe(saved.links);

  await render([row("Roadmap 2027", 3)]);
  expect(mentions.options).not.toBe(saved.options);
  expect(mentions.options.find((option) => option.type === "page")?.label).toBe("Roadmap 2027");
  const issueOption = (list: typeof mentions.options) => list.find((option) => option.type === "issue");
  expect(issueOption(mentions.options)).toBe(issueOption(saved.options));
  expect(mentions.scan("see @Roadmap 2027").some((segment) => segment.mention?.type === "page")).toBe(true);

  await act(async () => root.unmount());
});

it("offers nothing from a hidden project but still resolves what was already written (MIN-751)", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.hidden = new Set(["h"]);
  h.exactLoading = true;
  const members: never[] = [];
  let mentions!: DocumentEditorMentions;
  function Surface({ projectId }: { projectId: string }) {
    mentions = useDescriptionMentions(projectId, members);
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => { h.pages = []; root.render(<Surface projectId="p" />); });

  const offered = mentions.options.map((option) => `${option.type}:${option.id}`);
  expect(offered).toContain("issue:issue-1");
  expect(offered).toContain("project:p");
  expect(offered).not.toContain("issue:issue-9");
  expect(offered).not.toContain("objective:objective-9");
  expect(offered).not.toContain("project:h");
  // A pill written before the project was hidden keeps its label and link.
  expect(mentions.links!.label!("issue", "issue-9")).toBe("OLD-9");
  expect(mentions.links!.label!("objective", "objective-9")).toBe("Old launch");
  expect(mentions.links!.label!("project", "h")).toBe("Old project");
  expect(mentions.links!.href("issue", "issue-9")).toContain("/projects/h");

  // Writing inside the hidden project itself (opened by link) offers it again.
  await act(async () => root.render(<Surface projectId="h" />));
  expect(mentions.options.some((option) => option.type === "issue" && option.id === "issue-9")).toBe(true);

  await act(async () => root.unmount());
});
