// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { TooltipProvider } from "mangue-ui";
import { PrLinkedIssues } from "@/components/pull-requests/pr-linked-issues";
import { PrLinkIssue } from "@/components/pull-requests/pr-link-issue";
import type { PullRequestListItem } from "./agent-api";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const h = vi.hoisted(() => ({ unlink: vi.fn(), pending: false, issueId: "" }));
vi.mock("@/lib/use-unlink-pull-request-issue", () => ({
  useUnlinkPullRequestIssue: () => ({ mutate: h.unlink, isPending: h.pending, variables: { issueId: h.issueId } }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { issues: [] }, isPending: false }) }));
// Import the actual primitives without the barrel's unrelated emoji JSON dependency.
vi.mock("mangue-ui", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/button.tsx")),
  ...(await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/popover.tsx")),
  ...(await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/tooltip.tsx")),
  ...(await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/spinner.tsx")),
  ...(await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/dialog.tsx")),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/search-select", () => ({ SearchSelect: ({ trigger }: { trigger: ReturnType<typeof createElement> }) => trigger }));

const issues = [1, 2, 3].map((number) => ({
  id: `issue-${number}`, number, title: `Linked issue ${number}`, project_id: "project", project_key: "MIN",
}));
const item = (count: number) => ({ prId: "pr", issues: issues.slice(0, count) }) as PullRequestListItem;
let root: Root;
let container: HTMLDivElement;

async function render(element: ReturnType<typeof createElement>, locale: "en" | "fr" = "en") {
  await act(() => root.render(createElement(NextIntlClientProvider,
    { locale, messages: locale === "fr" ? fr : en, children: createElement(TooltipProvider, null, element) },
  )));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.clearAllMocks();
  h.pending = false;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("PR linked issue header", () => {
  it("opens and unlinks a single issue with an accessible cross action", async () => {
    const open = vi.fn();
    await render(createElement(PrLinkedIssues, { item: item(1), onOpenIssue: open }));
    const [issueButton, unlinkButton] = container.querySelectorAll("button");
    expect(issueButton.textContent).toBe("MIN-1");
    await act(() => issueButton.click());
    expect(open).toHaveBeenCalledWith("issue-1", "project");
    expect(unlinkButton.getAttribute("aria-label")).toBe("Unlink MIN-1 from this pull request");
    expect(unlinkButton.className).toContain("hover:text-destructive");
    await act(() => unlinkButton.click());
    expect(h.unlink).toHaveBeenCalledWith({ prId: "pr", issueId: "issue-1", identifier: "MIN-1" });
  });

  it("puts every linked issue and unlink action inside one popover", async () => {
    const open = vi.fn();
    await render(createElement(PrLinkedIssues, { item: item(3), onOpenIssue: open }));
    expect(container.querySelectorAll("button")).toHaveLength(1);
    const trigger = container.querySelector("button")!;
    expect(trigger.textContent).toBe("3 linked issues");
    await act(() => trigger.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    for (const issue of issues) {
      const button = dialog.querySelector<HTMLButtonElement>(`[aria-label="Unlink MIN-${issue.number} from this pull request"]`)!;
      expect(button).not.toBeNull();
      await act(() => button.click());
      expect(h.unlink).toHaveBeenLastCalledWith({ prId: "pr", issueId: issue.id, identifier: `MIN-${issue.number}` });
    }
    const issueButton = [...dialog.querySelectorAll("button")].find((button) => button.textContent?.includes("Linked issue 1"))!;
    await act(() => issueButton.click());
    expect(open).toHaveBeenCalledWith("issue-1", "project");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("shows no linked-issue controls when every association has been removed", async () => {
    await render(createElement(PrLinkedIssues, { item: item(0), onOpenIssue: vi.fn() }));
    expect(container.querySelector("button")).toBeNull();
  });

  it("disables unlink actions while a removal is pending", async () => {
    h.pending = true;
    h.issueId = "issue-1";
    await render(createElement(PrLinkedIssues, { item: item(1), onOpenIssue: vi.fn() }));
    expect(container.querySelector<HTMLButtonElement>('[aria-label^="Unlink"]')?.disabled).toBe(true);
  });
});

describe("PR issue link label", () => {
  it.each([
    ["en", [], "Link an issue"],
    ["en", ["issue-1"], "Link another issue"],
    ["fr", [], "Lier un ticket"],
    ["fr", ["issue-1"], "Lier un autre ticket"],
  ] as const)("uses the contextual %s label with %j associations", async (locale, ids, label) => {
    await render(createElement(PrLinkIssue, {
      prId: "pr", prState: "open", projectId: "project", projectKey: "MIN", linkedIssueIds: [...ids], onLinked: vi.fn(),
    }), locale);
    expect(container.querySelector("button")?.textContent).toBe(label);
  });
});
