// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunEvent, AgentRunSummary } from "./agent-api";
import { TooltipProvider } from "mangue-ui";

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  error: vi.fn(),
  run: { status: "running", title: "Implement the selected issue" } as Partial<AgentRunSummary>,
  events: [] as AgentRunEvent[],
  now: new Date("2026-10-01T12:00:00Z"),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useNow: () => h.now,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/app-link", () => ({ default: (props: Record<string, unknown>) => createElement("a", props) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("./use-agent-runs", () => ({
  useAgentRunQuery: () => ({ run: h.run }),
  useAgentRunEventsQuery: () => ({ events: h.events }),
}));
vi.mock("@/components/agent/agent-diff-sheet", () => ({ AgentDiffSheet: () => null }));
vi.mock("@/components/model-logo", () => ({ ModelLogo: () => null }));
vi.mock("@/components/mcp-agent-logo", () => ({ McpAgentLogo: () => null }));
// Exercise the real buttons, tooltips, and responsive detail panel without
// importing the package barrel's unrelated emoji data.
vi.mock("mangue-ui", async () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
  toast: { error: h.error },
  ...await import("mangue-ui/components/ui/button"),
  ...await import("mangue-ui/components/ui/tooltip"),
  ...await import("mangue-ui/components/ui/popover"),
  ...await import("mangue-ui/components/ui/dropdown-menu"),
  ...await import("mangue-ui/components/ui/side-panel"),
  ...await import("mangue-ui/components/ui/spinner"),
  ...await import("mangue-ui/lib/utils"),
}));

import { DelegatedWorkCard } from "@/components/assistant/delegated-work-card";

const runId = "51700000-0000-4000-8000-000000000001";
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  h.run.status = "running";
  h.run.pr_url = null; h.run.branch_name = null; h.run.id = runId;
  h.events = [];
  vi.stubGlobal("fetch", h.fetch);
  vi.stubGlobal("matchMedia", () => ({
    matches: false, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(createElement(TooltipProvider, {
    children: createElement(DelegatedWorkCard, {
      call: { id: "call-worker", status: "running", result: { run_id: runId } },
    }),
  })));
}

function stopButtons() {
  return [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="delegatedWorkActions"]')];
}

async function selectStop(anchor: HTMLButtonElement) {
  await act(async () => anchor.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 })));
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) => element.textContent?.includes("delegatedWorkStop"))!;
  expect(item).toBeDefined();
  expect(item.dataset.variant).toBe("destructive");
  await act(async () => item.click());
}

function expectStopPending(button: HTMLButtonElement) {
  expect(button.disabled).toBe(true);
  expect(button.querySelector('[role="status"]')).not.toBeNull();
}

describe("delegated worker Stop buttons", () => {
  it("sends the run-specific Stop request from the card's first click", async () => {
    h.fetch.mockImplementation(() => new Promise(() => {}));
    await render();
    const [stop] = stopButtons();
    await selectStop(stop);
    expect(h.fetch).toHaveBeenCalledExactlyOnceWith(`/api/agent-runs/${runId}/stop`, { method: "POST" });
    expectStopPending(stop);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => stop.click());
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("stops from the detail panel's first click and disables both shared anchors", async () => {
    h.fetch.mockImplementation(() => new Promise(() => {}));
    await render();
    const view = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("delegatedWorkView"))!;
    await act(async () => view.click());
    const stops = stopButtons();
    expect(stops).toHaveLength(2);
    await selectStop(stops[1]);
    expect(h.fetch).toHaveBeenCalledExactlyOnceWith(`/api/agent-runs/${runId}/stop`, { method: "POST" });
    stops.forEach(expectStopPending);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  it("restores the Stop control when the actual request fails", async () => {
    h.fetch.mockResolvedValue(Response.json({ error: "Stop was not acknowledged" }, { status: 500 }));
    await render();
    const [stop] = stopButtons();
    await selectStop(stop);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.error).toHaveBeenCalledWith("Stop was not acknowledged");
    expect(stop.disabled).toBe(false);
    expect(stop.querySelector('[role="status"]')).toBeNull();
  });

  it("places the internal PR button before View work and copies the branch", async () => {
    h.run.branch_name = "numo/min-678-filter"; h.run.pr_url = "https://github.com/example/app/pull/406"; h.run.pr_number = 406;
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await render();
    const pr = container.querySelector<HTMLAnchorElement>('a[href="/pull-requests?run=' + runId + '"]')!;
    expect(pr.textContent).toContain("viewPullRequest #406");
    expect(pr.target).toBe("");
    const view = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("delegatedWorkView"))!;
    expect(pr.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const copy = container.querySelector<HTMLButtonElement>('button[aria-label="copyBranch"]')!;
    await act(async () => copy.click());
    expect(writeText).toHaveBeenCalledWith("numo/min-678-filter");
  });

  it("does not offer Stop after the worker settles", async () => {
    h.run.status = "completed";
    await render();
    expect(stopButtons()).toHaveLength(0);
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
