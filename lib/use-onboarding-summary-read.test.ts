// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOnboarding, type UseOnboardingResult } from "./use-onboarding";
import { onboardingNeedsIssueCount } from "./onboarding";

const mocks = vi.hoisted(() => ({
  auth: { user: null as null | { id: string; user_metadata: Record<string, unknown> }, updateUserMetadata: vi.fn() },
  projects: { projects: [] as Array<{ id: string }>, loading: true },
}));
vi.mock("./auth-context", () => ({ useAuth: () => mocks.auth }));
vi.mock("./projects-context", () => ({ useProjects: () => mocks.projects }));
vi.mock("./use-analytics", () => ({ useAnalytics: () => ({ track: vi.fn(), setPersonProperties: vi.fn() }) }));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { error: vi.fn() },
}));

let root: Root;
let client: QueryClient;
let latest: UseOnboardingResult | null;
let fetchMock: ReturnType<typeof vi.fn>;
const started = { onboarding_started: true, onboarding_version: 2 };
const summaryReads = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/me/summary")).length;

function Harness() {
  latest = useOnboarding();
  return null;
}
async function render() {
  await act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Harness))));
}
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.auth.user = { id: "user-1", user_metadata: {} };
  mocks.auth.updateUserMetadata.mockReset().mockResolvedValue(undefined);
  mocks.projects.projects = [];
  mocks.projects.loading = true;
  fetchMock = vi.fn(async () => Response.json({ counts: { total: 3 } }));
  vi.stubGlobal("fetch", fetchMock);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  latest = null;
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  vi.unstubAllGlobals();
});

describe("onboarding issue-count read", () => {
  it("never reads the dashboard summary for an established unstarted account", async () => {
    await render();
    mocks.projects.projects = [{ id: "project-1" }];
    mocks.projects.loading = false;
    await render();
    await settle();
    expect(summaryReads()).toBe(0);
    expect(latest).toMatchObject({ loading: false, eligible: false, showChecklist: false });
  });

  it("reads it once to complete a started journey's tickets step", async () => {
    mocks.auth.user = { id: "user-1", user_metadata: started };
    mocks.projects.projects = [{ id: "project-1" }];
    mocks.projects.loading = false;
    await render();
    await settle();
    expect(summaryReads()).toBe(1);
    expect(latest?.steps.find((step) => step.id === "tickets")?.completed).toBe(true);
  });

  it("waits for projects before reading it to admit an empty account", async () => {
    fetchMock.mockImplementation(async () => Response.json({ counts: { total: 0 } }));
    await render();
    expect(summaryReads()).toBe(0);
    mocks.projects.loading = false;
    await render();
    await settle();
    expect(summaryReads()).toBe(1);
    expect(latest).toMatchObject({ loading: false, eligible: true, showChecklist: true });
  });
});

describe("onboardingNeedsIssueCount", () => {
  it.each([
    { name: "a started journey without the tickets step", meta: started, projects: 2, needed: true },
    { name: "a dismissed started journey without the tickets step", meta: { ...started, onboarding_dismissed: true }, projects: 2, needed: true },
    { name: "a started journey with the tickets step", meta: { ...started, onboarding_steps: ["tickets"] }, projects: 0, needed: false },
    { name: "an unstarted account without projects", meta: {}, projects: 0, needed: true },
    { name: "an unstarted account with projects", meta: {}, projects: 1, needed: false },
    { name: "an unstarted account while projects load", meta: null, projects: null, needed: false },
  ])("is $needed for $name", ({ meta, projects, needed }) => {
    expect(onboardingNeedsIssueCount(meta, projects)).toBe(needed);
  });
});
