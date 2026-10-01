// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "mangue-ui";

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  error: vi.fn(),
  run: { status: "running", title: "Implement the selected issue" },
  events: [],
  now: new Date("2026-10-01T12:00:00Z"),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useNow: () => h.now,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("./use-agent-runs", () => ({
  useAgentRunQuery: () => ({ run: h.run }),
  useAgentRunEventsQuery: () => ({ events: h.events }),
}));
vi.mock("@/components/agent/agent-diff-sheet", () => ({ AgentDiffSheet: () => null }));
vi.mock("@/components/model-logo", () => ({ ModelLogo: () => null }));
// Exercise the real buttons, tooltips, and responsive detail panel without
// importing the package barrel's unrelated emoji data.
vi.mock("mangue-ui", async () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
  toast: { error: h.error },
  ...await import("mangue-ui/components/ui/button"),
  ...await import("mangue-ui/components/ui/tooltip"),
  ...await import("mangue-ui/components/ui/popover"),
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
  return [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="delegatedWorkStop"]')];
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
    await act(async () => stop.click());
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
    await act(async () => stops[1].click());
    expect(h.fetch).toHaveBeenCalledExactlyOnceWith(`/api/agent-runs/${runId}/stop`, { method: "POST" });
    stops.forEach(expectStopPending);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  it("restores the Stop control when the actual request fails", async () => {
    h.fetch.mockResolvedValue(Response.json({ error: "Stop was not acknowledged" }, { status: 500 }));
    await render();
    const [stop] = stopButtons();
    await act(async () => stop.click());
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.error).toHaveBeenCalledWith("Stop was not acknowledged");
    expect(stop.disabled).toBe(false);
    expect(stop.querySelector('[role="status"]')).toBeNull();
  });

  it("does not offer Stop after the worker settles", async () => {
    h.run.status = "completed";
    await render();
    expect(stopButtons()).toHaveLength(0);
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
