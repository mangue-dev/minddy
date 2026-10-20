// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { BulkActionsRequest } from "@/lib/bulk-actions-context";
import en from "@/messages/en.json";
import { BulkIssueActions } from "./bulk-issue-actions";

const h = vi.hoisted(() => ({
  request: null as BulkActionsRequest | null,
  unlink: vi.fn(),
}));
vi.mock("@/lib/bulk-actions-context", () => ({
  useBulkActions: () => ({
    requestBulkActions: (request: BulkActionsRequest) => {
      h.request = request;
    },
    registerSelectionActions: () => {},
  }),
}));
vi.mock("@/components/issue-pr-context", () => ({
  useIssuePrStore: () => ({ get: () => [], linkedPullRequestIds: new Set() }),
}));
vi.mock("@/lib/bulk-pull-request-links", () => ({
  bulkPullRequestLinks: () => ({
    options: [],
    partial: [],
    unlinkable: [{ prId: "pr-1", issueId: "issue-1" }],
    targets: () => [],
  }),
}));
vi.mock("@/lib/use-link-issues-to-pull-request", () => ({
  useLinkIssuesToPullRequest: () => vi.fn(),
  useUnlinkIssuesFromPullRequests: () => h.unlink,
}));
vi.mock("@/lib/use-agent-runs", () => ({
  allPullRequestsQueryOptions: () => ({
    queryKey: ["open-pull-requests"],
    queryFn: async () => ({ pullRequests: [] }),
  }),
}));
vi.mock("@/components/pull-requests/pr-link-target-picker", () => ({
  linkablePullRequests: () => [],
}));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  h.request = null;
  h.unlink.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderPill(onDelete: () => void) {
  const queryClient = new QueryClient();
  await act(() =>
    root.render(
      createElement(NextIntlClientProvider, {
        locale: "en",
        messages: en,
        children: createElement(QueryClientProvider, {
          client: queryClient,
          children: createElement(
            TooltipProvider,
            null,
            createElement(BulkIssueActions, {
              count: 2,
              members: [],
              onUpdate: vi.fn(),
              onDelete,
              onClear: vi.fn(),
              onAskNumo: vi.fn(),
              issues: [
                { id: "issue-1", project_id: "project" },
                { id: "issue-2", project_id: "project" },
              ],
            }),
          ),
        }),
      }),
    ),
  );
  const actions = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === en.BulkActions.actions,
  )!;
  await act(async () => actions.click());
  return h.request!;
}

const dialog = () => document.querySelector('[role="alertdialog"]');
const dialogButton = (label: string) =>
  [...(dialog()?.querySelectorAll("button") ?? [])].find((button) => button.textContent === label)!;

describe("bulk issue actions", () => {
  it("only trashes the selection once the confirmation is accepted", async () => {
    const onDelete = vi.fn();
    const request = await renderPill(onDelete);

    await act(async () => request.onDelete!());

    expect(onDelete).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain("Move 2 issues to the trash?");
    expect(dialog()?.textContent).toContain("30 days");

    await act(async () => dialogButton(en.Common.moveToTrash).click());
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("keeps the selection when the trash confirmation is cancelled", async () => {
    const onDelete = vi.fn();
    const request = await renderPill(onDelete);

    await act(async () => request.onDelete!());
    await act(async () => dialogButton(en.Common.cancel).click());

    expect(onDelete).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("asks before unlinking the selection from all its pull requests", async () => {
    const request = await renderPill(vi.fn());

    await act(async () => request.pullRequestLinks!.onUnlinkAll());

    expect(h.unlink).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain("Unlink 1 issue from its pull requests?");

    await act(async () => dialogButton(en.PullRequests.unlinkIssue).click());
    expect(h.unlink).toHaveBeenCalledWith([{ prId: "pr-1", issueId: "issue-1" }]);
  });
});
