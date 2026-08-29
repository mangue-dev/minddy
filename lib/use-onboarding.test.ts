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
  keys: {
    keys: [] as Array<{ id: string }>,
    loading: false,
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
vi.mock("@/lib/use-ai-keys-query", () => ({ useAiKeysQuery: () => mocks.keys }));
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
      user_metadata: { onboarding_started: true },
    };
    mocks.auth.updateUserMetadata.mockClear();
    mocks.projects.projects = [];
    mocks.projects.loading = true;
    mocks.summary.counts = { total: 0 };
    mocks.summary.loading = true;
    mocks.keys.keys = [];
    mocks.keys.loading = false;
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

  it("does not expose the onboarding card before account signals are loaded", () => {
    renderHook();

    expect(latest?.loading).toBe(true);
    expect(latest?.visible).toBe(true);
    expect(latest?.showCard).toBe(false);
  });

  it("exposes the onboarding card once an eligible account is fully loaded", () => {
    mocks.projects.loading = false;
    mocks.summary.loading = false;

    renderHook();

    expect(latest?.loading).toBe(false);
    expect(latest?.showCard).toBe(true);
  });
});
