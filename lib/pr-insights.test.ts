// @vitest-environment jsdom

import { act, createElement, type ComponentProps, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrInsights } from "@/components/pull-requests/pr-insights";
import type { CheckState, ChecksSummary } from "@/lib/agent-api";
import messages from "@/messages/en.json";
import { groupReviewThreads } from "@/lib/pr-review-threads";
import { AI_REVIEW_PROVIDERS } from "@/lib/pr-ai-review/providers";

// Load the real primitives without the unrelated emoji picker barrel export.
vi.mock("mangue-ui", async () => ({
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/button.tsx"),
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/badge.tsx"),
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/popover.tsx"),
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/lib/utils.ts"),
}));

vi.mock("@/components/ui/app-tooltip", () => ({
  AppTooltip: ({ children }: { children: ReactElement }) => children,
}));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => createElement("span", { "data-numo-icon": true }) }));
vi.mock("@/components/git/forge-user-avatar", () => ({
  ForgeUserAvatar: ({ user }: { user: { login: string } }) => createElement("span", { "data-reviewer-login": user.login }),
}));

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
      onChecksOpenChange: vi.fn(), fix: null,
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
    expect(trigger("checks").textContent).toBe("");
    expect(trigger("checks").getAttribute("aria-label")).toContain("No checks");
    expect(trigger("checks").querySelector("circle")).not.toBeNull();
    expect(trigger("reviews").textContent).toBe("");
    expect(trigger("reviews").getAttribute("aria-label")).toContain("No reviews yet");
    expect(trigger("reviews").querySelector("[data-numo-icon]")).toBeNull();
    expect(trigger("conversations")).toBeNull();
    expect(trigger("numo-review")).toBeNull();
    expect(document.querySelector('[data-testid="pr-card-numo-review"]')).toBeNull();
  });

  it("opens one reviewer picker action and dismisses the popover", async () => {
    await render();
    await act(async () => trigger("reviews").click());
    const popover = document.querySelector('[data-testid="pr-reviews-popover"]');
    expect(popover).not.toBeNull();
    expect(container.contains(popover)).toBe(false);
    expect(popover!.querySelector('[data-testid="pr-card-numo-review"]')).toBeNull();
    const request = popover!.querySelector<HTMLButtonElement>('[data-testid="pr-request-reviewer"]')!;
    await act(async () => request.click());
    expect(document.querySelector('[data-testid="pr-reviews-popover"]')).toBeNull();
    expect(props.onRequestReviewer).toHaveBeenCalledOnce();
  });

  it("groups failed checks while other checks continue and leaves values uncolored", async () => {
    props.checks = checks("failure", "pending");
    await render();
    const group = document.querySelector('[data-testid="pr-insight-blockers"]')!;
    expect(group.contains(trigger("checks"))).toBe(true);
    expect(group.contains(trigger("reviews"))).toBe(false);
    expect(trigger("checks").getAttribute("aria-label")).toContain("1 check failed");
    expect(trigger("checks").className).not.toMatch(/bg-destructive|text-destructive/);
    const label = trigger("checks").closest(".min-h-9")!.firstElementChild!;
    expect(label.classList.contains("text-destructive")).toBe(true);
    const reviewLabel = trigger("reviews").closest(".min-h-9")!.firstElementChild!;
    expect(reviewLabel.classList.contains("text-destructive")).toBe(false);
  });

  it("retains the checks row and completion circle when a suite settles", async () => {
    props.checks = checks("pending", "success");
    await render();
    const before = trigger("checks");
    expect(before.querySelectorAll("circle")).toHaveLength(2);
    props.checks = checks("success", "success");
    await render();
    expect(trigger("checks")).toBe(before);
    expect(trigger("checks").getAttribute("aria-label")).toContain("2 checks passed");
    expect(trigger("checks").textContent).toBe("1 min 32s");
    expect(trigger("checks").querySelectorAll("circle")).toHaveLength(2);
  });

  it("does not count skipped checks as passed checks", async () => {
    props.checks = checks("success", "neutral");
    await render();
    expect(trigger("checks").getAttribute("aria-label")).toContain("1 check passed");
    props.checks = checks("neutral", "neutral");
    await render();
    expect(trigger("checks").getAttribute("aria-label")).toContain("Skipped");
  });

  it("keeps blocking rows visible and allows another control to open the checks", async () => {
    props.checks = checks("failure");
    await render();
    const group = document.querySelector('[data-testid="pr-insight-blockers"]')!;
    const header = group.querySelector('[data-testid="pr-insight-blockers-header"]')!;
    expect(header.querySelector("button")).toBeNull();
    await act(async () => header.querySelector<HTMLHeadingElement>("h3")!.click());
    expect(group.contains(trigger("checks"))).toBe(true);
    expect(group.querySelector('[data-slot="collapsible-content"]')).toBeNull();
    props.checksOpen = true;
    await render();
    expect(group.contains(trigger("checks"))).toBe(true);
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
    expect(trigger("reviews").textContent).toBe("");
    expect(trigger("reviews").getAttribute("aria-label")).toContain("Changes requested");
    expect(trigger("reviews").querySelector('[data-reviewer-login="reviewer"]')).not.toBeNull();
    await act(async () => trigger("reviews").click());
    expect(document.querySelector('[data-testid="pr-reviews-popover"]')!.textContent).toContain("Already reviewed by Numo");
  });

  it("shows a running Numo review below its reviewer banner without activity actions", async () => {
    const onOpen = vi.fn();
    props.numoReview = { kind: "running", label: messages.PullRequests.numoReviewRunning, onOpen, startedAt: "2026-10-05T10:00:00Z", durationMs: null };
    await render();
    expect(trigger("reviews").textContent).toBe("");
    expect(trigger("reviews").getAttribute("aria-label")).toContain("Numo is reviewing");
    expect(trigger("reviews").querySelector("[data-numo-icon]")).not.toBeNull();
    expect(trigger("numo-review")).toBeNull();
    await act(async () => trigger("reviews").click());
    const detail = document.querySelector('[data-testid="pr-insight-detail-numo-review"]')!;
    expect(detail.querySelector("header")!.textContent).toBe("Numo");
    expect(detail.querySelector("header")!.textContent).not.toContain("Numo is reviewing");
    expect(detail.textContent).toContain("Numo is reviewing");
    expect(detail.querySelector("button")).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("opens global correction actions beside the static blockers heading", async () => {
    const onCopy = vi.fn();
    const onLaunch = vi.fn();
    props.fix = { canLaunch: true, onCopy, onLaunch };
    await render();
    const header = document.querySelector('[data-testid="pr-insight-blockers-header"]')!;
    const action = header.querySelector<HTMLButtonElement>('[data-testid="pr-fix-action"]')!;
    expect(header.querySelectorAll("button")).toHaveLength(1);
    expect(trigger("fix")).toBeNull();
    await act(async () => action.click());
    expect(document.querySelector('[data-testid="pr-fix-popover"]')).not.toBeNull();
    const copy = document.querySelector<HTMLButtonElement>('[data-testid="pr-card-fix-copy"]')!;
    const launch = document.querySelector<HTMLButtonElement>('[data-testid="pr-card-fix-launch"]')!;
    await act(async () => copy.click());
    expect(onCopy).toHaveBeenCalledOnce();
    expect(copy.textContent).toBe("Copied");
    await act(async () => launch.click());
    expect(onLaunch).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-testid="pr-fix-popover"]')).toBeNull();
  });

  it("shows check results and durations without details links in the popover", async () => {
    props.checks = checks("success", "pending");
    props.checks.checks[0].url = "https://github.com/test/repository/actions/runs/1";
    props.checksOpen = true;
    await render();
    const popover = document.querySelector('[data-testid="pr-checks-popover"]')!;
    expect(popover.querySelector("a")).toBeNull();
    expect(popover.querySelector("h3")).toBeNull();
    expect(popover.getAttribute("aria-label")).toBe("Checks");
    expect(popover.textContent).toContain("Check 1");
    expect(popover.textContent).toContain("Passed");
    expect(popover.textContent).toContain("Running");
    expect(popover.textContent).toContain("1 min 32s");
  });

  it("shows human reviewer avatars and external logos without duplicate bot avatars", async () => {
    const provider = AI_REVIEW_PROVIDERS[0];
    const bot = { login: provider.githubLogins[0], avatar_url: null };
    props.timeline = [
      { id: "review:human", kind: "reviewed", actor: { login: "reviewer", avatar_url: null }, createdAt: null, reviewState: "commented" },
      { id: "review:bot", kind: "reviewed", actor: bot, createdAt: null, reviewState: "commented" },
    ];
    props.requestedReviewers = [{ login: "reviewer", avatar_url: null }, { login: "pending-reviewer", avatar_url: null }];
    props.aiReviews = [{ provider, state: "completed", startedAt: null, durationMs: 30_000, updatedAt: "2026-10-05T10:00:00Z", url: null }];
    await render();
    const button = trigger("reviews");
    expect(button.textContent).toBe("");
    expect(button.querySelectorAll('[data-reviewer-login="reviewer"]')).toHaveLength(1);
    expect(button.querySelector('[data-reviewer-login="pending-reviewer"]')).not.toBeNull();
    expect(button.querySelector(`[data-reviewer-login="${bot.login}"]`)).toBeNull();
    expect(button.querySelector(`[data-testid="pr-review-provider-${provider.id}"]`)).not.toBeNull();
  });

  it("does not display an idle Numo reviewer banner", async () => {
    await render();
    await act(async () => trigger("reviews").click());
    expect(document.querySelector('[data-testid="pr-insight-detail-numo-review"]')).toBeNull();
    expect(document.querySelector('[data-testid="pr-card-numo-review"]')).toBeNull();
  });

  it("opens running checks with the page clock instead of resetting to provider time", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-05T10:05:00Z"));
      props.checks = checks("pending");
      props.checksOpen = true;
      await render();
      expect(document.querySelector('[data-testid="pr-check-row"] .font-mono')!.textContent).toBe("5 min 0s");
      props.checksOpen = false;
      await render();
      await act(async () => vi.advanceTimersByTime(60_000));
      props.checksOpen = true;
      await render();
      const duration = () => document.querySelector('[data-testid="pr-check-row"] .font-mono')!.textContent;
      expect(duration()).toBe("6 min 0s");
      props.checksOpen = false;
      await render();
      await act(async () => vi.advanceTimersByTime(60_000));
      props.checksOpen = true;
      await render();
      expect(duration()).toBe("7 min 0s");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["requested", "running", "completed", "clean", "findings", "failed", "skipped"] as const)("groups %s agent metadata and verdicts below one banner without agent actions", async (state) => {
    const provider = AI_REVIEW_PROVIDERS[0];
    props.onRequestAiReview = vi.fn();
    props.timeline = [{ id: "review:codex", kind: "reviewed", actor: { login: provider.githubLogins[0], avatar_url: null }, createdAt: "2026-10-05T10:00:00Z", reviewState: "approved" }];
    props.aiReviews = [{ provider, state, startedAt: "2026-10-05T10:00:00Z", durationMs: 30_000, updatedAt: "2026-10-05T10:00:30Z", url: "https://github.com/test/repository/pull/1" }];
    props.requestedReviewers = [{ login: provider.githubLogins[0], avatar_url: null }, { login: "pending-reviewer", avatar_url: null }];
    await render();
    await act(async () => trigger("reviews").click());
    const section = document.querySelector(`[data-testid="pr-insight-detail-ai-review-${provider.id}"]`)!;
    const header = section.querySelector("header")!;
    expect(header.textContent).toBe(provider.name);
    expect(section.querySelector("button")).toBeNull();
    expect(document.querySelector('[data-testid="pr-card-numo-review"]')).toBeNull();
    expect(section.querySelector("time")).not.toBeNull();
    expect(section.textContent).toContain("approved");
    expect(header.textContent).not.toContain("approved");
    expect(document.querySelector('[data-testid="pr-reviews-details"]')!.querySelectorAll(`[data-reviewer-login="${provider.githubLogins[0]}"]`)).toHaveLength(0);
    const pending = document.querySelector('[data-testid="pr-reviews-details"] [data-reviewer-login="pending-reviewer"]')!;
    expect(pending.closest("header")).not.toBeNull();
  });

  it("closes the conversation popover when opening the feedback sidebar", async () => {
    props.conversationThreads = groupReviewThreads([{
      id: 1, body: "Review feedback", path: "app.tsx", line: 1, original_line: 1,
      side: "RIGHT", start_line: null, original_start_line: null, start_side: null,
      in_reply_to_id: null, review_id: 1, diff_hunk: "@@ -1 +1 @@", user: { login: "reviewer", avatar_url: null },
      created_at: "2026-10-05T10:00:00Z", html_url: "https://example.test/review/1",
    }]);
    await render();
    await act(async () => trigger("conversations").click());
    const popover = document.querySelector('[data-testid="pr-insight-detail-conversations"]')!.closest('[data-slot="popover-content"]')!;
    await act(async () => popover.querySelector<HTMLButtonElement>("button")!.click());
    expect(props.onOpenConversations).toHaveBeenCalledOnce();
    expect(document.contains(popover)).toBe(false);
    expect(trigger("conversations").getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps deployment copy feedback visible and closes the popover when viewing the deployment", async () => {
    const url = "https://preview.example.test";
    const writeText = vi.fn().mockResolvedValue(undefined);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      props.deployment = { status: "success", url, startedAt: null, durationMs: 30_000 };
      await render();
      await act(async () => trigger("deployment").click());
      const copy = document.querySelector<HTMLButtonElement>('[data-testid="pr-card-copy-deployment"]')!;
      const view = document.querySelector<HTMLButtonElement>('[data-testid="pr-card-view-deployment"]')!;
      expect(copy.querySelector("svg")).not.toBeNull();
      expect(view.querySelector("svg")).not.toBeNull();
      await act(async () => copy.click());
      expect(writeText).toHaveBeenCalledWith(url);
      expect(copy.textContent).toBe("Copied");
      expect(document.contains(copy)).toBe(true);
      await act(async () => view.click());
      expect(open).toHaveBeenCalledWith(url, "_blank", "noreferrer");
      expect(document.contains(view)).toBe(false);
    } finally {
      open.mockRestore();
      if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

});
