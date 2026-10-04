// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { ThreadComment } from "@/components/pull-requests/pr-detail";
import { updatePullRequestCommentApi } from "./agent-api";

vi.mock("mangue-ui", async () => {
  const { createElement: h } = await import("react");
  const wrapper = ({ children }: { children: import("react").ReactNode }) => h("div", null, children);
  const Button = ({ children, onClick }: { children: import("react").ReactNode; onClick?: () => void }) => h("button", { onClick }, children);
  const item = ({ children, onSelect }: { children: import("react").ReactNode; onSelect?: () => void }) => h("button", { onClick: onSelect }, children);
  const exports: Record<string, unknown> = { Button, DropdownMenuItem: item,
    DropdownMenu: wrapper, DropdownMenuTrigger: wrapper, DropdownMenuContent: wrapper,
    Dialog: wrapper, DialogContent: wrapper, DialogHeader: wrapper, DialogTitle: wrapper, DialogFooter: wrapper, Spinner: wrapper,
    cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "), toast: { error: vi.fn() } };
  return exports;
});
vi.mock("@/components/markdown", () => ({ Markdown: ({ children }: { children: string }) => createElement("p", null, children) }));
vi.mock("@/components/git/forge-user-avatar", () => ({ ForgeUserAvatar: () => null }));
vi.mock("@/components/git/git-login", () => ({ GitLogin: () => null }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function mount(commentId: number, updatedAt = "2026-10-04T12:00:00Z") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  await act(() => root.render(createElement(QueryClientProvider, { client },
    createElement(NextIntlClientProvider, { locale: "en", timeZone: "UTC", messages,
      children: createElement(ThreadComment, { endpoint: "/api/pull-requests/pr", commentId,
        body: "Current body", createdAt: "2026-10-04T10:00:00Z", updatedAt, user: null }) }))));
  return { container, client, close: async () => { await act(() => root.unmount()); client.clear(); container.remove(); } };
}

it("finishes history loading after selecting the menu item and keeps failures distinct from empty history", async () => {
  let release!: (response: Response) => void;
  const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => { release = resolve; }));
  vi.stubGlobal("fetch", fetch);
  const view = await mount(42);
  try {
    expect(fetch).not.toHaveBeenCalled();
    await act(() => Array.from(view.container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes(messages.PullRequests.viewPreviousVersions))!.click());
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/pull-requests/pr/comment-edits?commentId=42");
    expect(view.container.textContent).toContain(messages.PullRequests.previousVersionsLoading);
    await act(async () => release(Response.json({ error: "Unavailable" }, { status: 500 })));
    await act(async () => { await vi.waitFor(() => expect(view.container.textContent).toContain(messages.PullRequests.readFailed)); });
    expect(view.container.textContent).not.toContain(messages.PullRequests.previousVersionsEmpty);
    await act(() => Array.from(view.container.querySelectorAll("button"))
      .find((button) => button.textContent === messages.PullRequests.readRetry)!.click());
    await act(async () => release(Response.json({ edits: [{ body: "Original body", edited_by: null, created_at: "2026-10-04T11:00:00Z" }] })));
    await act(async () => { await vi.waitFor(() => expect(view.container.textContent).toContain("Original body")); });
    expect(view.container.textContent).not.toContain(messages.PullRequests.previousVersionsLoading);
  } finally { await view.close(); }
});

it.each([false, true])("uses recorded body history for the edited marker (history: %s)", async (hasHistory) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ edits: hasHistory
    ? [{ body: "Original", edited_by: null, created_at: "2026-10-04T11:00:00Z" }] : [] })));
  const view = await mount(0);
  try {
    await act(async () => { await vi.waitFor(() => expect(view.client.isFetching()).toBe(0)); await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(view.container.textContent?.includes(messages.PullRequests.edited)).toBe(hasHistory);
  } finally { await view.close(); }
});

it("does not treat equivalent comment timestamps as an edit", async () => {
  const view = await mount(42, "2026-10-04T12:00:00+02:00");
  try { expect(view.container.textContent).not.toContain(messages.PullRequests.edited); }
  finally { await view.close(); }
});

it("edits comments using the supplied endpoint once", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ comment: { id: 42 } }));
  vi.stubGlobal("fetch", fetch);
  await updatePullRequestCommentApi("/api/pull-requests/pr", { commentId: 42, body: "Revised" });
  expect(fetch.mock.calls[0]?.[0]).toBe("/api/pull-requests/pr/comments");
});
