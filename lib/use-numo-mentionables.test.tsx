// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { MentionOption } from "@/components/mention-suggest";
import type { MentionLinks } from "@/components/mention-links";
import { useNumoMentionables } from "./use-numo-mentionables";

const h = vi.hoisted(() => ({
  index: {
    issues: [],
    objectives: [],
    pages: [
      { id: "page-a", project_id: "p", title: "Guide", icon: null, updated_at: "2026-11-01T10:00:00Z" },
      { id: "page-b", project_id: "q", title: "Guide", icon: "📘", updated_at: "2026-11-01T10:00:00Z" },
      { id: "page-h", project_id: "h", title: "Old notes", icon: null, updated_at: "2026-11-01T10:00:00Z" },
      { id: "page-u", project_id: "p", title: "  ", icon: null, updated_at: "2026-11-01T10:00:00Z" },
    ],
  },
  projectPages: [{ id: "page-a", project_id: "p", title: "Guide", icon: null }],
  projects: [
    { id: "p", key: "MIN", name: "Minddy", icon_url: null },
    { id: "q", key: "WEB", name: "Website", icon_url: null },
    { id: "h", key: "OLD", name: "Old project", icon_url: null },
  ],
  hidden: new Set(["h"]),
  features: { options: [], label: () => null, detail: () => null, arm: () => {} },
  noRows: [],
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({ data: undefined, isPending: false }),
}));
vi.mock("@/lib/use-search-index", () => ({ useSearchIndex: () => ({ index: h.index, armNow: () => {} }) }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({ projects: h.projects }) }));
vi.mock("@/lib/use-members-query", () => ({ useMembersQuery: () => ({ members: h.noRows, loading: false }) }));
vi.mock("@/lib/use-issues-query", () => ({ useIssuesQuery: () => ({ issues: h.noRows, loading: false }) }));
vi.mock("@/lib/use-objectives-query", () => ({ useObjectivesQuery: () => ({ objectives: h.noRows, loading: false }) }));
vi.mock("@/lib/use-pages-query", () => ({ usePagesQuery: () => ({ pages: h.projectPages, loading: false }) }));
vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => ({ push: () => {} }), useAppNavigation: () => () => {} }));
vi.mock("@/lib/issue-panel-context", () => ({ useIssuePanelActions: () => ({ openIssue: () => {}, closeIssue: () => {} }) }));
vi.mock("@/lib/use-feature-mentions", () => ({ useFeatureMentions: () => h.features }));
vi.mock("@/lib/use-hidden-projects", () => ({ useHiddenProjects: () => ({ hiddenProjectIds: h.hidden }) }));

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

async function mount(scopeProjectId: string | null) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const result: { options: MentionOption[]; links: MentionLinks | null } = { options: [], links: null };
  function Surface() {
    const { mentionables, links } = useNumoMentionables(scopeProjectId);
    result.options = mentionables;
    result.links = links;
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root.render(<Surface />));
  return { result, unmount: () => act(async () => root.unmount()) };
}

const pages = (options: MentionOption[]) => options.filter((option) => option.type === "page");

it("offers the titled pages of every visible project, each naming its project, without a project (MIN-899)", async () => {
  const { result, unmount } = await mount(null);

  expect(pages(result.options)).toEqual([
    expect.objectContaining({ id: "page-a", projectId: "p", label: "Guide", detail: "Minddy" }),
    expect.objectContaining({ id: "page-b", projectId: "q", label: "Guide", detail: "Website", icon: "📘" }),
  ]);
  // A page of a hidden project is not offered, but a pill already written
  // still opens it and keeps its title.
  expect(result.links!.label!("page", "page-h")).toBe("Old notes");
  expect(result.links!.href("page", "page-b")).toContain("/projects/q");
  expect(result.links!.href("page", "page-h")).toContain("/projects/h");

  await unmount();
});

it("offers the project's own pages first and bare, then the other visible projects' pages (MIN-969)", async () => {
  const { result, unmount } = await mount("p");

  expect(pages(result.options)).toEqual([
    expect.objectContaining({ id: "page-a", projectId: "p", label: "Guide" }),
    expect.objectContaining({ id: "page-b", projectId: "q", label: "Guide", detail: "Website" }),
  ]);
  expect(pages(result.options)[0]).not.toHaveProperty("detail");
  // Another project's page opens from its pill; a hidden one still resolves.
  expect(result.links!.href("page", "page-b")).toContain("/projects/q");
  expect(result.links!.label!("page", "page-h")).toBe("Old notes");

  await unmount();
});
