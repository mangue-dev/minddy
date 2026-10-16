// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { MarkdownEditorMentions } from "@/components/markdown-editor";
import { useDescriptionMentions } from "./use-mention-sources";

type PageRow = { id: string; project_id: string; title: string; icon: string | null; version: number; updated_at: string };

const h = vi.hoisted(() => {
  const issues = [{ id: "issue-1", project_id: "p", number: 1, title: "Login fails", status: "todo" }];
  return {
    pages: [] as PageRow[],
    index: { issues, objectives: [], pages: [] },
    projects: [{ id: "p", key: "MIN", name: "Minddy", icon_url: null }],
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
vi.mock("@/lib/use-issues-query", () => ({ useIssuesQuery: () => ({ issues: h.noIssues, loading: false }) }));
vi.mock("@/lib/use-objectives-query", () => ({ useObjectivesQuery: () => ({ objectives: h.noObjectives, loading: false }) }));
vi.mock("@/lib/use-pages-query", () => ({ usePagesQuery: () => ({ pages: h.pages, loading: false }) }));
vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => h.router, useAppNavigation: () => h.navigation }));
vi.mock("@/lib/issue-panel-context", () => ({ useIssuePanelActions: () => h.panel }));

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

const row = (title: string, version: number): PageRow => ({
  id: "a", project_id: "p", title, icon: null, version, updated_at: `2026-10-15T10:00:0${version}Z`,
});

it("keeps the mention catalog through save acknowledgements and rebuilds only page rows on rename", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const members: never[] = [];
  let mentions!: MarkdownEditorMentions;
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
