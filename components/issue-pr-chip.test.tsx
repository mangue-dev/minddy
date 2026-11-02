// @vitest-environment jsdom
import { act, createContext, useContext, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { IssuePrReadiness } from "@/lib/issue-pr-store";
import { reducePullRequestReadiness } from "@/lib/pr-readiness";
import { IssuePrChip } from "./issue-pr-chip";

// Radix opens a hover card on pointer movement jsdom does not simulate: the
// mock opens it from a test button and mounts its content only while open.
const HoverState = createContext<{ open: boolean; onOpenChange: (open: boolean) => void }>({
  open: false, onOpenChange: () => {},
});
vi.mock("@/components/ui/hover-card", () => ({
  HoverCard: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) => (
    <HoverState.Provider value={{ open, onOpenChange }}>
      <button type="button" data-testid="hover" onClick={() => onOpenChange(true)} />
      {children}
    </HoverState.Provider>
  ),
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children, onClick }: { children: ReactNode; onClick?: (event: unknown) => void }) => {
    const { open } = useContext(HoverState);
    return open ? <div role="dialog" onClick={onClick}>{children}</div> : null;
  },
}));

const fetchMock = vi.fn();
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({
    preview: {
      type: "pull_request", number: 4, title: "Rotate the signing keys", state: "open", provider: "github",
      repository: "aurora/web", headBranch: null, baseBranch: null, author: null, openedAt: null, mergedAt: null,
    },
  })));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (
  pr: Parameters<typeof IssuePrChip>[0]["pr"],
  onOpenPr = vi.fn(),
  readiness?: IssuePrReadiness | null,
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return act(() => root.render(<QueryClientProvider client={client}>
    <NextIntlClientProvider locale="en" messages={messages}>
      <IssuePrChip pr={pr} readiness={readiness} onOpenPr={onOpenPr} />
    </NextIntlClientProvider>
  </QueryClientProvider>));
};

/** Opens the card, then waits until its preview has been read. */
async function openCard() {
  await act(async () => {
    host.querySelector<HTMLButtonElement>("[data-testid=hover]")!.click();
  });
  for (let attempt = 0; attempt < 50 && host.querySelector("[role=dialog] [data-slot=skeleton]"); attempt++) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  return host.querySelector("[role=dialog]")!;
}

const passing: IssuePrReadiness = {
  unavailable: false,
  readiness: reducePullRequestReadiness({
    state: "open", merged: false, draft: false, mergeabilityReason: "clean", policy: null,
    checks: [{ name: "build", state: "success", required: true }, { name: "lint", state: "success", required: true }],
    checksStatus: "loaded", approvals: null, changesRequested: null, reviewThreads: null, canWrite: true,
  }),
};

it("keeps an issue without a pull request silent", async () => {
  await render(null);
  expect(host.innerHTML).toBe("");
});

it("keeps a closed pull request silent", async () => {
  await render({ prId: "pr", prNumber: 4, state: "closed" });
  expect(host.innerHTML).toBe("");
});

it("opens a live pull request from the chip", async () => {
  const onOpenPr = vi.fn();
  await render({ prId: "pr", prNumber: 4, state: "open" }, onOpenPr);
  const button = host.querySelector<HTMLButtonElement>("button[aria-label]")!;
  expect(button.getAttribute("aria-label")).toBe(messages.Agent.viewPullRequest);
  await act(() => button.click());
  expect(onOpenPr).toHaveBeenCalledOnce();
});

it("reads nothing before its card opens, then shows where the pull request stands", async () => {
  const onOpenPr = vi.fn();
  await render({ prId: "pr", prNumber: 4, state: "open" }, onOpenPr, passing);
  expect(fetchMock).not.toHaveBeenCalled();

  const card = await openCard();
  // The board's readiness is reused: only the title and repository are read.
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(String(fetchMock.mock.calls[0][0])).toContain("/api/mentions/preview?type=pull_request&id=pr");
  expect(card.textContent).toContain("aurora/web");
  expect(card.textContent).toContain("Rotate the signing keys #4");
  expect(card.textContent).toContain("Open");
  expect(card.textContent).toContain("All 2 required checks passed");

  await act(() => (card as HTMLElement).click());
  expect(onOpenPr).toHaveBeenCalledOnce();
});

it("says nothing about checks on a merged pull request", async () => {
  await render({ prId: "pr", prNumber: 4, state: "merged" });
  const card = await openCard();
  expect(card.textContent).toContain("Merged");
  expect(card.textContent).not.toMatch(/check/i);
  // A merged pull request needs no readiness read.
  expect(fetchMock).toHaveBeenCalledOnce();
});
