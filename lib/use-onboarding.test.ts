// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOnboarding, type UseOnboardingResult } from "@/lib/use-onboarding";

const mocks = vi.hoisted(() => ({
  auth: {
    user: null as null | {
      id: string;
      user_metadata: Record<string, unknown>;
    },
    updateUserMetadata: vi.fn().mockResolvedValue(undefined),
  },
  projects: {
    projects: [] as Array<{ id: string }>,
    loading: true,
  },
  summary: {
    counts: { total: 0 },
    loading: true,
  },
  analytics: {
    track: vi.fn(),
    setPersonProperties: vi.fn(),
  },
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => mocks.projects }));
vi.mock("@/lib/use-home-summary-query", () => ({
  useHomeSummaryQuery: () => mocks.summary,
}));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => mocks.analytics }));
vi.mock("mangue-ui", () => ({ toast: { error: vi.fn() } }));

let latest: UseOnboardingResult | null = null;

function OnboardingHarness() {
  latest = useOnboarding();
  return null;
}

describe("useOnboarding", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    mocks.auth.user = {
      id: "user-1",
      user_metadata: { onboarding_started: true, onboarding_version: 2 },
    };
    mocks.auth.updateUserMetadata.mockReset().mockResolvedValue(undefined);
    mocks.projects.projects = [];
    mocks.projects.loading = true;
    mocks.summary.counts = { total: 0 };
    mocks.summary.loading = true;
    mocks.analytics.track.mockClear();
    mocks.analytics.setPersonProperties.mockClear();
    latest = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as typeof window & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  function renderHook() {
    act(() => root.render(createElement(OnboardingHarness)));
  }

  it("does not expose the onboarding checklist before account signals are loaded", () => {
    renderHook();

    expect(latest?.loading).toBe(true);
    expect(latest?.visible).toBe(true);
    expect(latest?.showChecklist).toBe(false);
  });

  it("exposes the onboarding checklist once an eligible account is fully loaded", () => {
    mocks.projects.loading = false;
    mocks.summary.loading = false;

    renderHook();

    expect(latest?.loading).toBe(false);
    expect(latest?.showChecklist).toBe(true);
  });

  it("keeps earlier optimistic acknowledgments in subsequent metadata writes", async () => {
    mocks.projects.loading = false;
    mocks.summary.loading = false;
    renderHook();
    await act(async () => { await latest!.acknowledgeStep("mcp"); });
    await act(async () => { await latest!.acknowledgeStep("numo"); });
    expect(mocks.auth.updateUserMetadata).toHaveBeenLastCalledWith({
      onboarding_version: 2, onboarding_steps: ["numo", "mcp"],
    });
    expect(latest!.steps.find((step) => step.id === "tickets")!.completed).toBe(false);
  });

  it("rolls back the completion screen when saving the last step fails", async () => {
    mocks.projects.loading = false;
    mocks.summary.loading = false;
    mocks.auth.user!.user_metadata.onboarding_steps = ["project", "tickets", "numo", "mcp"];
    let rejectWrite!: (error: Error) => void;
    mocks.auth.updateUserMetadata.mockImplementationOnce(() => new Promise((_, reject) => { rejectWrite = reject; }));
    renderHook();
    let saving!: Promise<void>;
    act(() => { saving = latest!.acknowledgeStep("cycles"); });
    expect(latest!.finalScreen).toBe(true);
    await act(async () => { rejectWrite(new Error("Save failed")); await saving; });
    expect(latest!.finalScreen).toBe(false);
    expect(latest!.currentStepId).toBe("cycles");
    expect(latest!.showChecklist).toBe(true);
  });

  it("restores the checklist if dismissal cannot be saved", async () => {
    mocks.projects.loading = false;
    mocks.summary.loading = false;
    mocks.auth.updateUserMetadata.mockRejectedValueOnce(new Error("Save failed"));
    renderHook();
    await act(async () => { await latest!.dismiss(); });
    expect(latest!.showChecklist).toBe(true);
  });

  it("shows completion once and closes it without a dismissal analytics event", async () => {
    mocks.projects.loading = false;
    mocks.summary.loading = false;
    mocks.auth.user!.user_metadata.onboarding_steps = ["project", "tickets", "numo", "mcp"];
    renderHook();
    await act(async () => { await latest!.acknowledgeStep("cycles"); });
    expect(latest!.finalScreen).toBe(true);
    expect(mocks.analytics.track.mock.calls.filter(([event]) => event === "onboarding_completed")).toHaveLength(1);
    await act(async () => { await latest!.finish(); });
    expect(latest!.showChecklist).toBe(false);
    expect(mocks.analytics.track.mock.calls.some(([event]) => event === "onboarding_dismissed")).toBe(false);
  });


  it("stamps a fresh account with the current onboarding version", async () => {
    mocks.projects.loading = false;
    mocks.summary.loading = false;
    mocks.auth.user!.user_metadata = {};
    await act(async () => { renderHook(); });
    expect(mocks.auth.updateUserMetadata).toHaveBeenCalledWith({
      onboarding_started: true, onboarding_version: 2, onboarding_steps: [],
    });
    expect(latest!.showChecklist).toBe(true);
  });

  it("preserves legacy progress when stamping an unstamped account", async () => {
    mocks.projects.loading = false;
    mocks.summary.loading = false;
    mocks.auth.user!.user_metadata = { onboarding_steps: ["mcp"] };
    await act(async () => { renderHook(); });
    expect(mocks.auth.updateUserMetadata).toHaveBeenCalledWith({
      onboarding_started: true, onboarding_version: 2, onboarding_steps: ["tickets", "mcp"],
    });
    expect(latest!.steps.find((step) => step.id === "tickets")!.completed).toBe(true);
  });

});
