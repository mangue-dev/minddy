// @vitest-environment jsdom
import { Activity, act, createElement, useLayoutEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackTeamPage } from "@/components/feedback/feedback-team-page";
import { AppTabRouteProvider } from "@/lib/app-tab-route-context";
import { CurrentViewProvider, useCurrentViewTaggedPublication } from "@/lib/current-view-context";
import { feedbackQueryOptions } from "@/lib/feedback-query";
import { feedbackDetailOptions } from "@/lib/secondary-view-queries";
import { FEEDBACK_OPEN_STATUSES } from "@/lib/feedback/types";
import type { TeamFeedbackListItem, TeamFeedbackDetail } from "@/lib/server/feedback/team-queries";
import type { FeedbackPropertyFilters } from "@/lib/collection-filters";
import type { FeedbackListFilters } from "@/lib/feedback-list-filters";

const state = vi.hoisted(() => ({
  replace: vi.fn(), push: vi.fn(), skeletonCommits: 0, publication: "", empty: [] as never[],
  setSearch: null as null | ((search: string) => void),
  controls: null as null | { state: string; onlyToReview: boolean; properties: FeedbackPropertyFilters;
    onToReviewChange: (next: boolean) => void; onPropertiesChange: (next: FeedbackPropertyFilters) => void },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace, push: state.push }) }));
vi.mock("next-intl", () => ({ useLocale: () => "en", useNow: () => new Date("2026-10-14T00:00:00Z"),
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
  useFormatter: () => ({ relativeTime: () => "Today", dateTime: () => "October 14" }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => false }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({ projects: [{ id: "00000000-0000-4000-8000-000000000001",
  owner_id: "owner", name: "Test project", key: "TEST", feedback_team_language: "en" }] }) }));
vi.mock("@/lib/use-issues-query", () => ({ useIssuesQuery: () => ({ issues: state.empty,
  createIssue: vi.fn(), updateIssue: vi.fn(), deleteIssue: vi.fn(), setCategories: vi.fn() }) }));
vi.mock("@/lib/use-issue-relations-query", () => ({ useIssueRelationsQuery: () => ({ relations: state.empty,
  addRelation: vi.fn(), removeRelation: vi.fn() }) }));
vi.mock("@/lib/use-members-query", () => ({ useMembersQuery: () => ({ members: state.empty }) }));
vi.mock("@/lib/use-categories-query", () => ({ useCategoriesQuery: () => ({ categories: state.empty }) }));
vi.mock("@/lib/use-objectives-query", () => ({ useObjectivesQuery: () => ({ objectives: state.empty }) }));
vi.mock("@/lib/use-feedback-timeline", () => ({ useFeedbackTimeline: () => ({ items: state.empty,
  addComment: vi.fn(), updateComment: vi.fn(), deleteComment: vi.fn(), deleteAttachment: vi.fn() }) }));
vi.mock("@/lib/use-feedback-categories", () => ({ useFeedbackCategories: () => vi.fn() }));
vi.mock("@/lib/use-feedback-dictation", () => ({ useFeedbackDictation: () => ({ busy: false,
  onTranscript: vi.fn(), noteRun: vi.fn(), reset: vi.fn() }) }));
vi.mock("@/lib/use-scroll-fade", () => ({ useScrollFade: () => ({ ref: { current: null }, scrollProps: {}, edges: {} }) }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantContext: vi.fn(), useAssistantPanelActions: () => ({ open: vi.fn() }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/ask-numo-context", async () => {
  const { createElement } = await import("react");
  return { AskNumoFeedbackProvider: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
    useAskNumoFeedbackTarget: () => () => {} };
});
vi.mock("@/components/feedback/feedback-filter-menu", async () => {
  const { createElement, useLayoutEffect } = await import("react");
  return { FeedbackFilterMenu: (props: NonNullable<typeof state.controls>) => {
    useLayoutEffect(() => { state.controls = props; });
    return createElement("output", { "data-testid": "filter-controls", "data-state": props.state,
      "data-review": String(props.onlyToReview) }, JSON.stringify(props.properties));
  } };
});
vi.mock("mangue-ui", async () => {
  const { createElement, useLayoutEffect } = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) => createElement("div", null, children);
  const Button = ({ children, onClick, disabled, ...props }: Record<string, any>) => createElement("button",
    { onClick, disabled, "aria-label": props["aria-label"] }, children);
  const Skeleton = () => {
    useLayoutEffect(() => { state.skeletonCommits++; }, []);
    return createElement("div", { "data-testid": "visible-skeleton" });
  };
  return { Badge: Box, Button, CommandGroup: Box, CommandItem: Box, CommandSeparator: Box,
    ConfirmDeleteDialog: () => null, DropdownMenu: Box, DropdownMenuContent: Box, DropdownMenuItem: Box,
    DropdownMenuTrigger: Box, Input: (props: Record<string, any>) => createElement("input", props),
    Skeleton, Spinner: Box, SplitButton: Button, Switch: Box,
    cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "), toast: { error: vi.fn(), success: vi.fn() } };
});
vi.mock("@/components/ui/dialog", async () => {
  const { createElement } = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) => createElement("div", null, children);
  return { Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? createElement("div", null, children) : null,
    DialogContent: Box, DialogDescription: Box, DialogFooter: Box, DialogHeader: Box, DialogTitle: Box };
});
vi.mock("@/components/secondary-sidebar", async () => {
  const { createElement } = await import("react");
  return { CollectionSidebar: ({ actions, children }: { actions: React.ReactNode; children: React.ReactNode }) =>
    createElement("aside", { "data-testid": "feedback-sidebar" }, actions, children) };
});
vi.mock("@/components/auto-textarea", async () => {
  const { createElement } = await import("react");
  return { AutoTextarea: (props: Record<string, any>) => createElement("textarea", { ...props, "data-testid": "feedback-title" }) };
});
vi.mock("@/components/markdown-editor-lazy", async () => {
  const { createElement } = await import("react");
  return { useIdleMarkdownEditorPreload: vi.fn(), MarkdownEditor: ({ value }: { value: string }) =>
    createElement("div", { "data-testid": "feedback-body", contentEditable: true, suppressContentEditableWarning: true }, value) };
});
vi.mock("@/components/issue-timeline", async () => {
  const { createElement } = await import("react");
  return { IssueActivity: () => null, CommentComposer: () => createElement("textarea", { "aria-label": "Feedback reply" }) };
});
vi.mock("@/components/send-shortcut", async () => {
  const { createElement } = await import("react");
  return { SendShortcutTooltip: ({ children }: { children: React.ReactNode }) => createElement("div", null, children), isSendShortcut: () => false };
});
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/components/icon", () => ({ AppIcon: () => null }));
vi.mock("@/components/feedback/deferred-feedback-setup-wizard", () => ({ DeferredFeedbackSetupWizard: () => null }));
vi.mock("@/components/issue-side-panel", () => ({ IssueSidePanel: () => null }));
vi.mock("@/components/create-issue-dialog", () => ({ CreateIssueDialog: () => null }));
vi.mock("@/components/agent-beam", () => ({ AgentBeamOverlay: () => null }));
vi.mock("@/components/ai-elements/dictate-button", () => ({ DictateButton: () => null }));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/components/search-menu", () => ({ SearchMenu: () => null }));
vi.mock("@/components/search-select", () => ({ SearchSelect: () => null }));
vi.mock("@/components/issue-indicators", () => ({ StatusIndicator: () => null }));
vi.mock("@/app/f/[token]/feedback-bits", () => ({ FeedbackStatusBadge: () => null }));
vi.mock("@/components/ui/tooltip", async () => { const { createElement } = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) => createElement("div", null, children);
  return { Tooltip: Box, TooltipContent: Box, TooltipTrigger: Box }; });
vi.mock("@/components/app-content-header", async () => { const { createElement } = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) => createElement("div", null, children);
  return { AppContentHeader: Box }; });
vi.mock("@/components/empty-scene", async () => { const { createElement } = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) => createElement("div", null, children);
  return { EmptyScene: Box }; });
vi.mock("@/components/markdown", async () => { const { createElement } = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) => createElement("div", null, children);
  return { Markdown: Box }; });
vi.mock("@/components/issue-property-fields", async () => {
  const { createElement } = await import("react");
  return { TRIGGER: "", CategoryValue: () => null, ObjectiveValue: () => null,
    PropertyRow: ({ children }: { children?: React.ReactNode }) => createElement("div", null, children) };
});
vi.mock("@/components/app-link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children }: { href: string; children: React.ReactNode }) => createElement("a", { href }, children) };
});

const projectId = "00000000-0000-4000-8000-000000000001";
const category = "00000000-0000-4000-8000-000000000002";
const otherCategory = "00000000-0000-4000-8000-000000000003";
const postId = (index: number) => `00000000-0000-4000-9000-${index.toString(16).padStart(12, "0")}`;
const pathname = `/projects/${projectId}/feedback`;
const normalFilters = { statuses: [...FEEDBACK_OPEN_STATUSES] };
const rows = (): TeamFeedbackListItem[] => Array.from({ length: 120 }, (_, index) => ({
  id: postId(index + 1), project_id: projectId, title: `Feedback ${index + 1}`, body: `Useful content ${index + 1}`,
  submitted_title: `Feedback ${index + 1}`, submitted_body: `Useful content ${index + 1}`,
  status: index < 96 ? "open" : "shipped", review_state: index === 1 ? "pending" : "published",
  sensitivity: null, moderation_reason: null, review_attempts: 0, review_error: null,
  category_ids: [index === 3 ? otherCategory : category], objective_id: null, author_id: null,
  is_public: true, source: "board", author: null, vote_count: 120 - index, issue_id: null,
  suggested_merge_into_id: null, suggested_title: null, merged_into_id: null, translated_language: null,
  translated_title: null, translated_body: null, source_language: "en", created_at: "2026-10-14T00:00:00Z",
} as unknown as TeamFeedbackListItem));
const detail = (post: TeamFeedbackListItem): TeamFeedbackDetail => ({ ...post, merged_from: [], merge_events: [], issue: null });
let client: QueryClient, root: Root, container: HTMLDivElement;
let source: TeamFeedbackListItem[], requests: string[], finishFull: (() => void) | undefined;
let initialSearch: string;

function Publication() {
  const value = useCurrentViewTaggedPublication();
  useLayoutEffect(() => { state.publication = value?.snapshot.href ?? ""; }, [value]);
  return null;
}
function Host({ hidden = false }: { hidden?: boolean }) {
  const [search, setSearch] = useState(initialSearch);
  useLayoutEffect(() => { state.setSearch = setSearch; }, []);
  return createElement(QueryClientProvider, { client }, createElement(CurrentViewProvider, null,
    createElement(AppTabRouteProvider, { route: { projectId, pathname, search }, active: !hidden,
      children: createElement(Activity, { mode: hidden ? "hidden" : "visible", children: [
        createElement(FeedbackTeamPage, { key: "feedback" }), createElement(Publication, { key: "publication" }),
      ] }) })));
}
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
// Resolving the full response, parsing it and selecting the post can take more
// than one short tick on a loaded CI worker; wait for the observable outcome.
const settleUntil = async (done: () => boolean) => { for (let tick = 0; tick < 200 && !done(); tick++) await settle(); };
const selectedTitle = () => container.querySelector<HTMLTextAreaElement>('[data-testid="feedback-title"]')?.value;
const render = (hidden = false) => act(() => root.render(createElement(Host, { hidden })));
function seedNormal(filters: FeedbackListFilters = normalFilters) {
  client.setQueryData(feedbackQueryOptions(projectId, filters).queryKey, {
    posts: source.filter((post) => post.status === "open" && (!filters.category?.length || filters.category.includes(post.category_ids[0]))),
    board_enabled: true,
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks(); state.skeletonCommits = 0; state.publication = ""; state.controls = null; state.setSearch = null;
  source = rows(); requests = []; finishFull = undefined; initialSearch = "";
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000, gcTime: Infinity } } });
  for (const row of source) client.setQueryData(feedbackDetailOptions(projectId, row.id).queryKey, { post: detail(row) });
  window.history.replaceState(null, "", pathname);
  state.replace.mockImplementation((href: string) => {
    window.history.replaceState(null, "", href);
    state.setSearch?.(new URL(href, "https://minddy.test").search.slice(1));
  });
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    requests.push(url);
    if (url === `/api/projects/${projectId}/feedback`) return new Promise<Response>((resolve) => {
      finishFull = () => resolve(Response.json({ posts: source, board_enabled: true }));
    });
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  }));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount()); finishFull?.(); client.clear(); container.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("FeedbackTeamPage requested-post query scope", () => {
  it("publishes, consumes and re-enters a known accepted post without a full GET or committed skeleton", async () => {
    seedNormal(); initialSearch = `post=${postId(1)}`;
    await render(); await settle();
    expect(selectedTitle()).toBe("Feedback 1");
    expect(container.querySelector('[data-testid="feedback-body"]')?.textContent).toBe("Useful content 1");
    expect(container.querySelector('textarea[aria-label="Feedback reply"]')).not.toBeNull();
    expect(state.replace).toHaveBeenCalledWith(pathname);
    expect(new URL(state.publication, "https://minddy.test").searchParams.get("post")).toBe(postId(1));
    await render(true); await render(false); await settle();
    await act(() => state.setSearch?.(`post=${postId(1)}`)); await settle();
    expect(selectedTitle()).toBe("Feedback 1");
    expect(requests).toEqual([]);
    expect(state.skeletonCommits).toBe(0);
    expect(container.querySelector('[data-testid="visible-skeleton"]')).toBeNull();
    expect(client.getQueryState(["feedback", projectId])).toBeUndefined();
    expect(client.getQueryData<{ posts: unknown[] }>(feedbackQueryOptions(projectId, normalFilters).queryKey)?.posts).toHaveLength(96);
    expect(state.controls).toMatchObject({ state: "unresolved", onlyToReview: false, properties: {} });
  });

  it("preserves a saved property filter when its accepted scope already contains the selected target", async () => {
    const filters = { ...normalFilters, category: [category] }; seedNormal(filters);
    initialSearch = `category=${category}&post=${postId(1)}`;
    await render(); await settle();
    expect(selectedTitle()).toBe("Feedback 1");
    expect(requests).toEqual([]); expect(state.skeletonCommits).toBe(0);
    expect(state.controls).toMatchObject({ state: "unresolved", properties: { category: [category] } });
    expect(new URL(window.location.href).searchParams.get("category")).toBe(category);
    expect(new URL(window.location.href).searchParams.has("post")).toBe(false);
  });

  it.each(["resolved", "property mismatch"])("uses an actual full response and selects a %s explicit target", async (reason) => {
    const target = reason === "resolved" ? postId(120) : postId(4);
    if (reason === "property mismatch") { seedNormal({ ...normalFilters, category: [category] }); initialSearch = `category=${category}&post=${target}`; }
    else { seedNormal(); initialSearch = `post=${target}`; }
    await render(); await settle();
    expect(requests).toEqual([`/api/projects/${projectId}/feedback`]);
    expect(client.getQueryData(["feedback", projectId])).toBeUndefined();
    expect(state.skeletonCommits).toBeGreaterThan(0);
    await act(async () => { finishFull!(); });
    const expected = reason === "resolved" ? "Feedback 120" : "Feedback 4";
    await settleUntil(() => selectedTitle() === expected);
    expect(selectedTitle()).toBe(expected);
    expect(state.controls).toMatchObject({ state: "all", onlyToReview: false, properties: {} });
    expect(new URL(state.publication, "https://minddy.test").searchParams.get("post")).toBe(target);
    expect(client.getQueryData<{ posts: unknown[] }>(["feedback", projectId])?.posts).toHaveLength(120);
  });

  it("keeps a matching review-only target in scope and widens for an explicit hidden-by-review target", async () => {
    seedNormal(); initialSearch = `post=${postId(2)}`;
    await render(); await settle();
    await act(() => state.controls!.onToReviewChange(true)); await settle();
    await act(() => state.setSearch?.(`post=${postId(2)}`)); await settle();
    expect(selectedTitle()).toBe("Feedback 2");
    expect(state.controls?.onlyToReview).toBe(true); expect(requests).toEqual([]);
    await act(() => state.setSearch?.(`post=${postId(1)}`)); await settle();
    expect(requests).toEqual([`/api/projects/${projectId}/feedback`]);
    await act(async () => { finishFull!(); });
    await settleUntil(() => selectedTitle() === "Feedback 1");
    expect(selectedTitle()).toBe("Feedback 1");
    // The existing zero-review-count effect can clear review-only while the
    // full query is pending; do not invent a new status-state contract here.
    expect(state.controls).toMatchObject({ onlyToReview: false, properties: {} });
  });

  it("does not consume a changed post into the active browser URL while its retained Activity is hidden", async () => {
    seedNormal(); initialSearch = `post=${postId(1)}`;
    await render(); await settle(); await render(true);
    state.replace.mockClear();
    await act(() => state.setSearch?.(`post=${postId(2)}`)); await settle();
    expect(state.replace).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
    await render(false); await settle();
    expect(selectedTitle()).toBe("Feedback 2");
    expect(state.replace).toHaveBeenCalledWith(pathname);
    expect(requests).toEqual([]);
  });

});
