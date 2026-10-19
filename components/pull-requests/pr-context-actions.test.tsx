// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunPrResponse, PullRequestListItem } from "@/lib/agent-api";
import { usePrContextActions } from "./pr-context-actions";

const state = vi.hoisted(() => ({
  detail: undefined as unknown as () => Promise<unknown>,
  reviews: undefined as unknown as () => Promise<unknown>,
  act: vi.fn(), openIntent: vi.fn(), toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantPanelActions: () => ({ openIntent: state.openIntent }) }));
vi.mock("@/lib/agent-api", () => ({ actOnPullRequestApi: state.act, prEndpoint: (id: string) => `/api/pull-requests/${id}` }));
vi.mock("@/lib/pull-request-query", () => ({ pullRequestQueryOptions: (id: string) => ({ queryKey: ["pull-request", id], queryFn: () => state.detail() }) }));
vi.mock("@/lib/pr-activity-query", () => ({ prReviewCommentsQueryOptions: (endpoint: string | null) => ({ queryKey: ["pr-review-comments", endpoint], queryFn: () => state.reviews() }) }));
// Stubs for the UI primitives the component under test renders.
const uiStubs = vi.hoisted(() => {
  let value: Promise<Record<string, unknown>> | undefined;
  return () => (value ??= (async () => {
  const { createElement } = await import("react");
  const Box = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return {
    toast: state.toast, AlertDialog: Box, AlertDialogContent: Box, AlertDialogHeader: Box, AlertDialogTitle: Box,
    AlertDialogDescription: Box, AlertDialogFooter: Box, AlertDialogCancel: Box,
    AlertDialogAction: ({ children, onClick }: { children: ReactNode; onClick: () => void }) =>
      createElement("button", { "data-confirm": true, onClick }, children),
  };
})());
});
vi.mock("sonner", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), toast: stubs.toast };
});
vi.mock("@/components/ui/alert-dialog", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), AlertDialog: stubs.AlertDialog, AlertDialogContent: stubs.AlertDialogContent, AlertDialogHeader: stubs.AlertDialogHeader, AlertDialogTitle: stubs.AlertDialogTitle, AlertDialogDescription: stubs.AlertDialogDescription, AlertDialogFooter: stubs.AlertDialogFooter, AlertDialogCancel: stubs.AlertDialogCancel, AlertDialogAction: stubs.AlertDialogAction };
});

const item = (pr_state: PullRequestListItem["pr_state"] = "open"): PullRequestListItem => ({
  prId: "pr-1", pr_number: 7, pr_url: "https://github.com/acme/app/pull/7", pr_state, provider: "github",
  title: "Fix the card", author: null, head_branch: "fix-card", created_at: "", updated_at: "", issue: null,
  project: { id: "project", key: "APP", name: "App", icon_url: null, orb_seed: null },
});
const detail = (overrides: Partial<AgentRunPrResponse> = {}): AgentRunPrResponse => ({
  pr: { draft: false, title: "Fix the card", url: "https://github.com/acme/app/pull/7", head: "fix-card", base: "main" },
  files: [], checks: null,
  viewer: { capability: "write" },
  readiness: { state: "ready", blockers: [], passed: [], mergeAllowed: true, methods: ["squash"], preferredMethod: "squash" },
  ...overrides,
} as unknown as AgentRunPrResponse);

let client: QueryClient, root: Root, host: HTMLDivElement;
let hook: ReturnType<typeof usePrContextActions>;
const optimistic = vi.fn(), rollback = vi.fn(), confirmed = vi.fn(), refetch = vi.fn(), merge = vi.fn();
let rows: PullRequestListItem[];
function Probe() {
  hook = usePrContextActions({ pullRequests: rows, onOptimisticStateChange: (...args) => { optimistic(...args); return rollback; },
    onStateChange: confirmed, onRefetchList: refetch, onMerge: merge });
  return createElement("div", null, createElement("button", { "data-pr-id": "pr-1" }), hook.dialog);
}
const render = () => act(() => root.render(createElement(QueryClientProvider, { client, children: createElement(Probe) })));
const row = () => host.querySelector("[data-pr-id]")!;
const openMenu = async () => {
  await act(async () => hook.onItemContextMenu(row()));
  for (let tick = 0; tick < 20; tick++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return hook.itemContextActions(row());
};
const ids = (actions: { id: string; disabled?: boolean }[]) => actions.map((action) => `${action.id}${action.disabled ? ":disabled" : ""}`);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  rows = [item()];
  state.detail = () => Promise.resolve(detail());
  state.reviews = () => Promise.resolve({ comments: [], threads: [], reactions: [] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("usePrContextActions", () => {
  it("builds nothing before that row's menu opened", async () => {
    await render();
    expect(hook.itemContextActions(row())).toEqual([]);
  });

  it("keeps writes disabled until the menu's own read is fresh", async () => {
    let finish!: (value: unknown) => void;
    state.detail = () => new Promise((resolve) => { finish = resolve; });
    await render();
    await act(async () => hook.onItemContextMenu(row()));
    expect(ids(hook.itemContextActions(row()))).toEqual(["pr-state-draft:disabled", "pr-state-closed:disabled", "pr-fix-copy:disabled", "pr-fix-numo:disabled"]);
    await act(async () => { finish(detail()); });
    for (let tick = 0; tick < 20; tick++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(ids(hook.itemContextActions(row()))).toEqual(["pr-merge", "pr-state-draft", "pr-state-closed"]);
  });

  it("hides forge writes from a viewer without write access", async () => {
    state.detail = () => Promise.resolve(detail({ viewer: { capability: "read" } as AgentRunPrResponse["viewer"] }));
    await render();
    expect(ids(await openMenu())).toEqual([]);
  });

  it("offers reopen only for a closed pull request and nothing for a merged one", async () => {
    rows = [item("closed")];
    await render();
    expect(ids(await openMenu())).toEqual(["pr-state-open"]);
    rows = [item("merged")];
    await render();
    expect(ids(hook.itemContextActions(row()))).toEqual([]);
  });

  it("withholds merge when readiness blocks it and offers the fix entries instead", async () => {
    state.detail = () => Promise.resolve(detail({
      readiness: { state: "blocked", blockers: [{ id: "c", kind: "conflicts", required: true, status: "blocked", source: "pull_request" }],
        passed: [], mergeAllowed: false, methods: ["squash"], preferredMethod: "squash" } as unknown as AgentRunPrResponse["readiness"],
    }));
    await render();
    const actions = await openMenu();
    expect(ids(actions)).toEqual(["pr-state-draft", "pr-state-closed", "pr-fix-copy", "pr-fix-numo"]);
    actions.find((action) => action.id === "pr-fix-numo")!.onSelect!();
    expect(state.openIntent).toHaveBeenCalledWith(expect.objectContaining({
      source: "pull_request", action: "fix", projectId: "project",
      pageContext: expect.objectContaining({ pullRequestId: "pr-1", prNumber: 7, prHeadRef: "fix-card", prBaseRef: "main" }),
    }));
    expect(state.openIntent.mock.calls[0][0].prompt).toContain("Head branch: fix-card");
  });

  it("confirms a state change, then rolls the list back when the forge refuses", async () => {
    state.act.mockRejectedValue(new Error("Branch protected"));
    await render();
    const close = (await openMenu()).find((action) => action.id === "pr-state-closed")!;
    await act(async () => close.onSelect!());
    expect(state.act).not.toHaveBeenCalled();
    await act(async () => host.querySelector<HTMLButtonElement>("[data-confirm]")!.click());
    expect(optimistic).toHaveBeenCalledWith("pr-1", "closed");
    expect(state.act).toHaveBeenCalledWith("pr-1", "close");
    expect(rollback).toHaveBeenCalledOnce();
    expect(confirmed).not.toHaveBeenCalled();
    expect(state.toast.error).toHaveBeenCalledWith("Branch protected");
    expect(refetch).toHaveBeenCalled();
  });

  it("hands merge over to the detail of the right-clicked pull request", async () => {
    await render();
    (await openMenu()).find((action) => action.id === "pr-merge")!.onSelect!();
    expect(merge).toHaveBeenCalledWith("pr-1");
  });
});
