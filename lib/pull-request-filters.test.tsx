// @vitest-environment jsdom

import { Activity, act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PullRequestsPage } from "@/components/pull-requests/pull-requests-page";
import type { PrDetail } from "@/components/pull-requests/pr-detail";
import type { SearchMenuProps } from "@/components/search-menu";
import { AppTabRouteProvider } from "./app-tab-route-context";
import { nextReadActivationSequence } from "./read-activation-sequence";
import { allPullRequestsQueryKey, PULL_REQUESTS_PAGE, useCompletedPullRequestsQuery } from "./use-agent-runs";
import { ApiError, type PullRequestListItem, type PullRequestListResponse } from "./agent-api";
import en from "@/messages/en.json";

const h = vi.hoisted(() => ({
  fetchList: vi.fn(),
  replace: vi.fn(),
  merge: vi.fn<() => Promise<void>>(),
  prepared: vi.fn<() => typeof PrDetail | undefined>(),
}));
vi.mock("./app-tab-surfaces", async () => ({
  ...await vi.importActual<typeof import("./app-tab-surfaces")>("./app-tab-surfaces"),
  preparedPullRequestDetailSurface: h.prepared,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace }) }));
vi.mock("next/dynamic", () => ({
  default: () => function Detail({ item, onOptimisticStateChange, onStateChange, onRefetchList }: ComponentProps<typeof PrDetail>) {
    return <section data-dynamic-detail><input aria-label="Unsent PR draft" /><button onClick={async () => {
      onOptimisticStateChange?.(item.prId, "merged");
      await h.merge();
      onStateChange?.(item.prId, "merged");
      onRefetchList();
    }}>Merge {item.title}</button></section>;
  },
}));
vi.mock("./agent-api", async () => ({
  ...await vi.importActual<typeof import("./agent-api")>("./agent-api"),
  fetchAllPullRequestsApi: h.fetchList,
}));
vi.mock("./supabase", () => ({ getSupabase: () => ({}) }));
vi.mock("./use-agent-runs", async () => {
  const actual = await vi.importActual<typeof import("./use-agent-runs")>("./use-agent-runs");
  return {
    ...actual,
    useCompletedPullRequestsQuery: vi.fn(actual.useCompletedPullRequestsQuery),
    usePullRequestReadinessBatchQuery: () => ({ readinessByPrId: {}, unavailablePrIds: new Set(), error: false }),
  };
});
vi.mock("./app-tab-navigation-context", () => ({ useOptionalAppTabNavigation: () => null }));
vi.mock("./projects-context", () => ({ useProjects: () => ({ projects: [{ id: "project" }], loading: false }) }));
vi.mock("./assistant-panel-context", () => ({ useAssistantContext: () => {}, useAssistantPanelActions: () => ({ openIntent: () => {} }) }));
vi.mock("./current-view-context", () => ({ usePublishCurrentView: () => {} }));
vi.mock("./use-mobile-layout", () => ({ useMobileLayout: () => false }));
vi.mock("./use-my-avatar", () => ({ useMyAvatarSource: () => null }));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));
vi.mock("@/components/project-orb", () => ({ ProjectOrb: () => null }));
vi.mock("@/components/pull-requests/pr-readiness", () => ({ PrReadinessIcon: () => null }));
vi.mock("@/components/pull-requests/pr-state-badge", () => ({ PrStateBadge: () => null }));
vi.mock("@/components/pull-requests/pr-loading-skeleton", () => ({ PrDetailSkeleton: () => null, PrListSkeleton: () => null }));
vi.mock("@/components/ui/app-tooltip", () => ({ AppTooltip: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/secondary-sidebar", () => ({
  CollectionSidebar: ({ actions, children }: { actions: ReactNode; children: ReactNode }) => <aside>{actions}{children}</aside>,
}));
// Keep real command options and the page's controlled menu state; omit portal positioning.
vi.mock("@/components/search-menu", async () => {
  const { Command, CommandList } = await vi.importActual<typeof import("@/components/ui/command")>("@/components/ui/command");
  return { SearchMenu: ({ open, onOpenChange, trigger, children }: SearchMenuProps) => (
    <div>
      <div onClick={() => onOpenChange(!open)}>{trigger}</div>
      {open ? <Command><CommandList>{children}</CommandList></Command> : null}
    </div>
  ) };
});

function item(state: PullRequestListItem["pr_state"] = "open", prId = "pr"): PullRequestListItem {
  return {
    prId, pr_number: 1, pr_url: null, pr_state: state, provider: "github",
    title: prId, author: null, head_branch: "feature", created_at: "2026-10-01", updated_at: "2026-10-01",
    issue: null, project: null, createdByMe: true,
  };
}
function response(pullRequests: PullRequestListItem[]): PullRequestListResponse {
  return { pullRequests, hasMore: false, truncated: false, repoCount: 1, anyPr: true };
}
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let rows: PullRequestListItem[];
let search: string;
let activation: number;

async function render(active = true) {
  window.history.replaceState(null, "", active ? `/pull-requests?${search}` : "/projects/project");
  if (active) activation = nextReadActivationSequence();
  await act(() => root.render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Activity mode={active ? "visible" : "hidden"}>
          <AppTabRouteProvider route={{ pathname: "/pull-requests", search, projectId: null }} active={active} activationSequence={activation}>
            <PullRequestsPage />
          </AppTabRouteProvider>
        </Activity>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  ));
}
async function flush() {
  await act(async () => {
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
  });
}
async function openFilters() {
  await act(() => container.querySelector<HTMLButtonElement>(`[aria-label="${en.PullRequests.filterSections}"]`)!.click());
}
function option(label = en.PullRequests.sectionCompleted) {
  const found = [...container.querySelectorAll<HTMLElement>('[role="option"]')].find((node) => node.textContent === label);
  expect(found).toBeDefined();
  return found!;
}
function expectCompleted(enabled: boolean) {
  expect(option().hasAttribute("data-checked")).toBe(enabled);
  expect(vi.mocked(useCompletedPullRequestsQuery).mock.calls.at(-1)).toEqual([enabled]);
}
async function toggle(label = en.PullRequests.sectionCompleted) {
  await act(() => option(label).click());
  await flush();
}
async function refetch() {
  await act(async () => {
    await client.refetchQueries({ queryKey: ["pull-requests", "all", "open"] });
  });
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.prepared.mockReturnValue(undefined);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  rows = [item()];
  search = "pr=pr";
  activation = 0;
  h.fetchList.mockImplementation(async ({ state, pin }) => response(
    rows.filter((pr) => state === "completed"
      ? ["merged", "closed"].includes(pr.pr_state)
      : ["open", "draft"].includes(pr.pr_state) || pr.prId === pin?.pr),
  ));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  container.remove();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function PreparedDetail() {
  return <section data-prepared-detail><input aria-label="Unsent PR draft" /></section>;
}

describe("prepared pull request renderer", () => {
  it("mounts prepared detail directly and keeps its draft and DOM across tab returns", async () => {
    h.prepared.mockReturnValue(PreparedDetail);
    client.setQueryData(allPullRequestsQueryKey("open", PULL_REQUESTS_PAGE, { pr: "pr" }), response(rows));
    await render(); await flush();
    const input = container.querySelector<HTMLInputElement>("[data-prepared-detail] input")!;
    expect(input).not.toBeNull();
    expect(container.querySelector("[data-dynamic-detail]")).toBeNull();
    input.value = "Unsent prepared draft";
    h.prepared.mockReturnValue(undefined);
    await render(false); await render(); await flush();
    expect(container.querySelector("[data-prepared-detail] input")).toBe(input);
    expect(input.value).toBe("Unsent prepared draft");
  });

  it("keeps a mounted dynamic detail when preparation finishes later", async () => {
    client.setQueryData(allPullRequestsQueryKey("open", PULL_REQUESTS_PAGE, { pr: "pr" }), response(rows));
    await render(); await flush();
    const input = container.querySelector<HTMLInputElement>("[data-dynamic-detail] input")!;
    expect(input).not.toBeNull();
    input.value = "Unsent cold draft";
    h.prepared.mockReturnValue(PreparedDetail);
    await render(false); await render(); await flush();
    expect(container.querySelector("[data-dynamic-detail] input")).toBe(input);
    expect(input.value).toBe("Unsent cold draft");
    expect(container.querySelector("[data-prepared-detail]")).toBeNull();
  });
});

describe("Pull Requests completed filter", () => {
  it("keeps completed off after merging and returning to a retained link tab", async () => {
    let confirm!: () => void;
    h.merge.mockImplementation(() => new Promise<void>((resolve) => { confirm = resolve; }));
    await render();
    await flush();
    await openFilters();
    expectCompleted(false);
    const merge = [...container.querySelectorAll("button")].find((button) => button.textContent === "Merge pr")!;
    expect(merge).toBeDefined();
    await act(() => merge.click());
    expect(client.getQueryData<PullRequestListResponse>(
      allPullRequestsQueryKey("open", PULL_REQUESTS_PAGE, { pr: "pr" }),
    )?.pullRequests).toEqual([]);
    await render(false);
    rows = [item("merged")];
    await act(async () => { confirm(); });
    expect(h.replace).not.toHaveBeenCalled();
    await render();
    await flush();
    await refetch();
    expectCompleted(false);
    expect(h.fetchList.mock.calls.some(([input]) => input.state === "completed")).toBe(false);

    await toggle();
    expectCompleted(true);
    expect(container.querySelector('[data-navigation-href="/pull-requests?pr=pr"]')).not.toBeNull();
    expect(h.replace).toHaveBeenCalledWith("/pull-requests", { scroll: false });
    await toggle();
    await refetch();
    expectCompleted(false);
  });

  it.each(["merged", "closed"] as const)("requires manual activation for a link pointing to a %s PR", async (state) => {
    rows = [item(state)];
    await render();
    await flush();
    await openFilters();
    expectCompleted(false);
    await refetch();
    expectCompleted(false);
    expect(h.fetchList.mock.calls.some(([input]) => input.state === "completed")).toBe(false);
    await toggle();
    expectCompleted(true);
    expect(h.fetchList.mock.calls.some(([input]) => input.state === "completed")).toBe(true);
    await render(false);
    await render();
    await flush();
    expectCompleted(true);
    await toggle();
    await render(false);
    await render();
    await flush();
    expectCompleted(false);
  });

  it("allows the empty-state action to enable completed PRs explicitly", async () => {
    rows = [item("merged")];
    await render();
    await flush();
    await openFilters();
    expectCompleted(false);
    const showAll = [...container.querySelectorAll("button")].find((button) => button.textContent === en.PullRequests.emptyShowAll)!;
    expect(showAll).toBeDefined();
    await act(() => showAll.click());
    await flush();
    expectCompleted(true);
    expect(h.replace).toHaveBeenCalledWith("/pull-requests", { scroll: false });
    await toggle();
    await refetch();
    expectCompleted(false);
  });

  it("still enables a hidden active section when a new link resolves", async () => {
    await render();
    await flush();
    await openFilters();
    await toggle(en.PullRequests.sectionCreatedByMe);
    expect(option(en.PullRequests.sectionCreatedByMe).hasAttribute("data-checked")).toBe(false);
    search = "pr=other";
    rows = [item("open", "other")];
    await render();
    await flush();
    // A finished request can precede React Query's batched observer notification.
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(option(en.PullRequests.sectionCreatedByMe).hasAttribute("data-checked")).toBe(true);
    });
    expectCompleted(false);
    expect(container.querySelector('[data-navigation-href="/pull-requests?pr=other"]')).not.toBeNull();
  });
});

describe("Pull Requests list read failure", () => {
  it("reports a failed read instead of asking to link a repository, then recovers on retry", async () => {
    const failure = Object.assign(new ApiError("Forbidden", "permissionDenied"), { status: 403 });
    const list = h.fetchList.getMockImplementation()!;
    h.fetchList.mockImplementation(async () => { throw failure; });
    await render();
    await flush();
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(en.PullRequests.listReadFailed);
    });
    expect(container.textContent).not.toContain(en.PullRequests.emptyNoRepo);
    h.fetchList.mockImplementation(list);
    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === en.PullRequests.readRetry)!;
    await act(() => retry.click());
    await flush();
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(container.querySelector('[data-navigation-href="/pull-requests?pr=pr"]')).not.toBeNull();
    });
    expect(container.textContent).not.toContain(en.PullRequests.listReadFailed);
  });
});
