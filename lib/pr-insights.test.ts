// @vitest-environment jsdom

import { act, createElement, type ComponentProps, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrInsights } from "@/components/pull-requests/pr-insights";
import type { CheckState, ChecksSummary } from "@/lib/agent-api";
import messages from "@/messages/en.json";

// Load the real primitives without the unrelated emoji picker barrel export.
vi.mock("mangue-ui", async () => ({
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/button.tsx"),
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/badge.tsx"),
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/popover.tsx"),
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/collapsible.tsx"),
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/lib/utils.ts"),
}));

vi.mock("@/components/ui/app-tooltip", () => ({
  AppTooltip: ({ children }: { children: ReactElement }) => children,
}));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));
vi.mock("@/components/git/forge-user-avatar", () => ({ ForgeUserAvatar: () => null }));

function checks(...states: CheckState[]): ChecksSummary {
  return {
    state: states.includes("failure") ? "failure" : states.includes("pending") ? "pending" : "success",
    passing: states.filter((state) => state === "success" || state === "neutral").length,
    total: states.length,
    startedAt: "2026-10-05T10:00:00Z",
    completedAt: states.includes("pending") ? null : "2026-10-05T10:01:32Z",
    checks: states.map((state, index) => ({
      name: `Check ${index + 1}`, state,
      url: null, appName: null, appAvatarUrl: null, description: null,
      startedAt: "2026-10-05T10:00:00Z", completedAt: null,
      durationMs: state === "pending" ? null : 92_000, required: true, rerunRef: null,
    })),
  };
}

describe("pull request insight properties", () => {
  let root: Root;
  let container: HTMLDivElement;
  let props: ComponentProps<typeof PrInsights>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    props = {
      readiness: null, checks: checks("success"), provider: "github", deployment: null,
      conversationThreads: [], timeline: [], requestedReviewers: [], canRequestReviewer: true,
      onRequestReviewer: vi.fn(), canAct: () => false, acting: null, onAction: vi.fn(),
      onOpenConversations: vi.fn(), onOpenReviewApprove: vi.fn(), onStartFileReview: vi.fn(),
      numoReview: { kind: "requested", label: messages.PullRequests.aiReview, onOpen: null, startedAt: null, durationMs: null },
      fixRun: null, numoMerge: null, checksOpen: false,
      onChecksOpenChange: vi.fn(), onRequestReview: vi.fn(), fix: null,
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function render() {
    await act(async () => root.render(createElement(NextIntlClientProvider, {
      locale: "en", messages, timeZone: "UTC", now: new Date("2026-10-05T10:02:00Z"),
      children: createElement(PrInsights, props),
    })));
  }

  function trigger(id: string) {
    return document.querySelector<HTMLButtonElement>(`[data-testid="pr-status-card-${id}"]`)!;
  }

  it("keeps checks and reviews available without empty conversation or Numo rows", async () => {
    props.checks = checks();
    await render();
    expect(trigger("checks").textContent).toContain("No checks");
    expect(trigger("reviews").textContent).toContain("No reviews yet");
    expect(trigger("conversations")).toBeNull();
    expect(trigger("numo-review")).toBeNull();
    expect(document.querySelector('[data-testid="pr-card-numo-review"]')).toBeNull();
  });

  it("opens a reviews popover with both human and Numo request actions", async () => {
    await render();
    await act(async () => trigger("reviews").click());
    const popover = document.querySelector('[data-testid="pr-reviews-popover"]');
    expect(popover).not.toBeNull();
    expect(container.contains(popover)).toBe(false);
    const numo = popover!.querySelector<HTMLButtonElement>('[data-testid="pr-card-numo-review"]')!;
    const human = popover!.querySelector<HTMLButtonElement>('[data-testid="pr-request-reviewer"]')!;
    await act(async () => numo.click());
    await act(async () => human.click());
    expect(props.onRequestReview).toHaveBeenCalledOnce();
    expect(props.onRequestReviewer).toHaveBeenCalledOnce();
  });

  it("groups failed checks while other checks continue and leaves values uncolored", async () => {
    props.checks = checks("failure", "pending");
    await render();
    const group = document.querySelector('[data-testid="pr-insight-blockers"]')!;
    expect(group.contains(trigger("checks"))).toBe(true);
    expect(group.contains(trigger("reviews"))).toBe(false);
    expect(trigger("checks").textContent).toContain("1 check failed");
    expect(trigger("checks").className).not.toMatch(/bg-destructive|text-destructive/);
  });

  it("retains the checks row and completion circle when a suite settles", async () => {
    props.checks = checks("pending", "success");
    await render();
    const before = trigger("checks");
    expect(before.querySelectorAll("circle")).toHaveLength(2);
    props.checks = checks("success", "success");
    await render();
    expect(trigger("checks")).toBe(before);
    expect(trigger("checks").textContent).toContain("2 checks passed");
    expect(trigger("checks").textContent).toContain("1 min 32s");
    expect(trigger("checks").querySelectorAll("circle")).toHaveLength(2);
  });

  it("does not count skipped checks as passed checks", async () => {
    props.checks = checks("success", "neutral");
    await render();
    expect(trigger("checks").textContent).toContain("1 check passed");
    props.checks = checks("neutral", "neutral");
    await render();
    expect(trigger("checks").textContent).toContain("Skipped");
  });

  it("reopens the blocking group when another control opens the checks", async () => {
    props.checks = checks("failure");
    await render();
    const group = document.querySelector('[data-testid="pr-insight-blockers"]')!;
    const toggle = group.querySelector<HTMLButtonElement>("button")!;
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    props.checksOpen = true;
    await render();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[data-testid="pr-checks-popover"]')).not.toBeNull();
  });
  it("keeps a human change request blocking even after Numo finishes", async () => {
    props.timeline = [{
      id: "review:1", kind: "reviewed", actor: { login: "reviewer", avatar_url: null },
      createdAt: "2026-10-05T09:00:00Z", reviewState: "changes_requested",
    }];
    props.numoReview = { kind: "current", label: messages.PullRequests.numoReviewUpToDateShort, onOpen: vi.fn(), startedAt: null, durationMs: 30_000 };
    await render();
    const group = document.querySelector('[data-testid="pr-insight-blockers"]')!;
    expect(group.contains(trigger("reviews"))).toBe(true);
    expect(trigger("reviews").textContent).toContain("Changes requested");
    await act(async () => trigger("reviews").click());
    expect(document.querySelector('[data-testid="pr-reviews-popover"]')!.textContent).toContain("Already reviewed by Numo");
  });

  it("keeps a running Numo review integrated and opens its conversation", async () => {
    const onOpen = vi.fn();
    props.numoReview = { kind: "running", label: messages.PullRequests.numoReviewRunning, onOpen, startedAt: "2026-10-05T10:00:00Z", durationMs: null };
    await render();
    expect(trigger("reviews").textContent).toContain("Numo is reviewing");
    expect(trigger("numo-review")).toBeNull();
    await act(async () => trigger("reviews").click());
    const detail = document.querySelector('[data-testid="pr-insight-detail-numo-review"]')!;
    await act(async () => detail.querySelector<HTMLButtonElement>("button")!.click());
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("keeps correction actions visible in a popover on click", async () => {
    const onCopy = vi.fn();
    const onLaunch = vi.fn();
    props.fix = { canLaunch: true, onCopy, onLaunch };
    await render();
    await act(async () => trigger("fix").click());
    const copy = document.querySelector<HTMLButtonElement>('[data-testid="pr-card-fix-copy"]')!;
    const launch = document.querySelector<HTMLButtonElement>('[data-testid="pr-card-fix-launch"]')!;
    await act(async () => copy.click());
    expect(onCopy).toHaveBeenCalledOnce();
    expect(copy.textContent).toBe("Copied");
    await act(async () => launch.click());
    expect(onLaunch).toHaveBeenCalledOnce();
    expect(launch.textContent).toBe("Launched");
  });

});
