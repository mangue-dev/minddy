// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkEvents } from "@/components/assistant/work-events";
import { WorkAccordion } from "@/components/assistant/work-accordion";
import { ToolCallList } from "@/components/assistant/tool-call-display";
import { liveSecretRevealKey } from "@/components/assistant/secret-callout";
import { workEventsRevealKey, type WorkEvent } from "./work-event-groups";
import messages from "@/messages/en.json";

// Load the actual primitives without the package barrel's unrelated emoji picker.
vi.mock("mangue-ui", async () => ({
  ...await import("mangue-ui/components/ui/collapsible"),
  ...await import("mangue-ui/components/ui/button"),
  ...await import("mangue-ui/components/ui/input"),
  ...await import("mangue-ui/lib/utils"),
}));
vi.mock("@/components/assistant/seed-proposal-card", () => ({ SeedProposalCard: () => null }));

type Call = Parameters<typeof ToolCallList>[0]["items"][number];
const integration = (overrides: Partial<Call> = {}): Call => ({
  id: "integration-1",
  name: "create_integration",
  status: "complete",
  result: { key: "fixture-integration-key", integration: { kind: "issues" } },
  ...overrides,
});
const feedback = (): Call => ({
  id: "feedback-2",
  name: "configure_feedback_board",
  status: "complete",
  result: { sso_secret: "fixture-sso-secret" },
});

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

async function render(calls: Call[], active = true, reasoning = true) {
  const events: WorkEvent<ReactNode>[] = [
    ...(reasoning ? [{ key: "reasoning", kind: "action" as const, content: "Reasoning" }] : []),
    {
      key: "tools",
      kind: "action",
      count: calls.length,
      revealKey: liveSecretRevealKey(calls),
      content: createElement(ToolCallList, { items: calls }),
    },
  ];
  await act(async () => root.render(createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "UTC",
    now: new Date("2026-09-05T12:00:10Z"),
    children: createElement(WorkAccordion, {
      active,
      startedAt: "2026-09-05T12:00:00Z",
      endedAt: active ? null : "2026-09-05T12:00:10Z",
      revealKey: workEventsRevealKey(events),
      children: createElement(WorkEvents, { events }),
    }),
  })));
}

function actionToggle() {
  return [...container.querySelectorAll("button")].find((button) => /^\d+ actions$/.test(button.textContent ?? ""))!;
}
const inputs = () => [...container.querySelectorAll("input")];

describe("one-time credentials in work accordions", () => {
  it("opens an existing group when a running integration call returns its credential", async () => {
    await render([integration({ status: "running", result: undefined })]);
    expect(actionToggle().getAttribute("aria-expanded")).toBe("false");
    expect(inputs()).toHaveLength(0);
    await render([integration()]);
    expect(actionToggle().getAttribute("aria-expanded")).toBe("true");
    expect(inputs().map((input) => input.value)).toEqual(["MINDDY_API_KEY=fixture-integration-key"]);
    expect(inputs()[0].type).toBe("password");

    await render([integration()], false);
    expect(container.querySelector('[data-slot="collapsible"]')?.getAttribute("data-state")).toBe("open");
    expect(inputs()).toHaveLength(1);
  });

  it("reopens for a second credential but respects manual closing for the same result", async () => {
    await render([integration()]);
    await act(async () => actionToggle().click());
    expect(actionToggle().getAttribute("aria-expanded")).toBe("false");
    await render([integration()]);
    expect(actionToggle().getAttribute("aria-expanded")).toBe("false");
    await render([integration(), feedback()]);
    expect(actionToggle().getAttribute("aria-expanded")).toBe("true");
    expect(inputs()).toHaveLength(2);
    expect(inputs().map((input) => input.value)).toContain("MINDDY_SSO_SECRET=fixture-sso-secret");
  });

  it("reopens a manually closed completed turn when a new credential arrives", async () => {
    await render([integration()], false);
    const outer = container.querySelector('[data-slot="collapsible"]')!;
    await act(async () => (outer.querySelector("button") as HTMLButtonElement).click());
    expect(outer.getAttribute("data-state")).toBe("closed");
    await render([integration()], false);
    expect(outer.getAttribute("data-state")).toBe("closed");
    await render([integration(), feedback()], false);
    expect(outer.getAttribute("data-state")).toBe("open");
    expect(inputs()).toHaveLength(2);
  });

  it("shows a completed feedback secret immediately and keeps a single action visible after completion", async () => {
    await render([feedback()], false, false);
    expect(actionToggle()).toBeUndefined();
    expect(inputs()).toHaveLength(1);
  });

  it.each([
    integration({ result: { key: "[redacted]" } }),
    integration({ result: {} }),
    integration({ status: "running" }),
    integration({ success: false }),
    { ...feedback(), result: { sso_secret: "[redacted]" } },
  ])("keeps redacted, missing, running, and failed results folded: %#", async (call) => {
    expect(liveSecretRevealKey([call])).toBeUndefined();
    await render([call]);
    expect(actionToggle().getAttribute("aria-expanded")).toBe("false");
    expect(inputs()).toHaveLength(0);
    await render([call], false);
    expect(container.querySelector('[data-slot="collapsible"]')?.getAttribute("data-state")).toBe("closed");
  });

  it("uses call IDs rather than secret values to track newly revealed results", () => {
    const key = liveSecretRevealKey([integration(), feedback()]);
    expect(key).toBe('["integration-1","feedback-2"]');
    expect(key).not.toContain("fixture");
  });
});
