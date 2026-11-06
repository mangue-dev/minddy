// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReasoningBlock } from "@/components/agent/reasoning-block";
import { ToolCallList, toolCallTarget, type ToolCallItem } from "@/components/assistant/tool-call-display";
import { issueHref, objectiveHref, pagePath } from "@/lib/app-urls";
import messages from "@/messages/en.json";
vi.mock("@/components/assistant/seed-proposal-card", () => ({ SeedProposalCard: () => null }));

const PROJECT = "11111111-1111-4111-8111-111111111111";
const ISSUE = "22222222-2222-4222-8222-222222222222";
const PAGE = "33333333-3333-4333-8333-333333333333";
const OBJECTIVE = "44444444-4444-4444-8444-444444444444";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(children: ReactNode) {
  await act(async () => root.render(createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "UTC",
    children,
  })));
}

const createdIssue = (overrides: Partial<ToolCallItem> = {}): ToolCallItem => ({
  id: "call-1",
  name: "create_issue",
  arguments: JSON.stringify({ project_id: PROJECT, title: "Fix login" }),
  status: "complete",
  success: true,
  result: { issue: { id: ISSUE, number: 42, project_id: PROJECT, identifier: "MIN-42" } },
  ...overrides,
});

describe("reasoning line", () => {
  it("stays folded by default and opens the trace on demand", async () => {
    await render(createElement(ReasoningBlock, {
      active: false,
      durationMs: 6_200,
      text: "Check the **auth** flow first.",
    }));
    const toggle = container.querySelector("button")!;
    expect(toggle.textContent).toContain("Thought for 6 seconds");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("auth flow");

    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Check the auth flow first.");
  });

  it("keeps a live trace folded while the counter runs", async () => {
    await render(createElement(ReasoningBlock, {
      active: true,
      durationMs: 65_000,
      text: "Reading the plan",
    }));
    const toggle = container.querySelector("button")!;
    expect(toggle.textContent).toContain("Thinking for 1 minute and 5 seconds");
    expect(toggle.querySelector(".text-shimmer")).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders a plain line when there is no trace to open", async () => {
    await render(createElement(ReasoningBlock, { active: false, durationMs: 0 }));
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toContain("Thought for 1 second");
  });
});

describe("action lines", () => {
  it("links the ticket a completed action created", async () => {
    await render(createElement(ToolCallList, { items: [createdIssue()] }));
    const link = container.querySelector("a")!;
    expect(link.textContent).toBe("Created MIN-42");
    expect(link.getAttribute("href")).toBe(
      issueHref(PROJECT, { id: ISSUE, number: 42, project_id: PROJECT }),
    );
  });

  it("does not link a running or failed action", async () => {
    await render(createElement(ToolCallList, {
      items: [createdIssue({ status: "running", result: undefined })],
    }));
    expect(container.querySelector("a")).toBeNull();
    expect(toolCallTarget(createdIssue({ success: false }))).toBeNull();
  });

  it("resolves pages and objectives from their result or arguments", () => {
    expect(toolCallTarget({
      id: "p",
      name: "create_page",
      arguments: JSON.stringify({ project_id: PROJECT, title: "Notes" }),
      status: "complete",
      result: { page_id: PAGE },
    })).toBe(pagePath(PROJECT, PAGE));
    expect(toolCallTarget({
      id: "o",
      name: "update_objective",
      arguments: JSON.stringify({ project_id: PROJECT, objective_id: OBJECTIVE }),
      status: "complete",
      result: { updated: true },
    })).toBe(objectiveHref(PROJECT, OBJECTIVE));
    expect(toolCallTarget({
      id: "s",
      name: "search_issues",
      arguments: JSON.stringify({ project_id: PROJECT, query: "auth" }),
      status: "complete",
      result: { issues: [] },
    })).toBeNull();
  });
});
