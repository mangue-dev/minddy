// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

/**
 * The mobile apps sell nothing (MIN-907): inside the native shell, no surface
 * may render a way to a purchase. Each case renders the same component in a
 * browser, where the link must exist, and in the app, where it must not.
 */

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  summary: {
    loading: false,
    planId: "free" as "free" | "go" | "pro",
    status: {
      managedBilling: true,
      managedAi: true,
      stripeConfigured: true,
      adminOverride: null,
      subscription: null,
    },
    usage: { managedBilling: true, managedAi: true },
  },
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useFormatter: () => ({ dateTime: () => "June 1", number: (value: number) => String(value) }),
  useTranslations: (namespace: keyof typeof en) => (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      (en[namespace] as Record<string, string>)[key] ?? key),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/use-billing-query", () => ({
  billingStatusQueryKey: ["billing", "status"],
  billingUsageQueryKey: ["billing", "usage"],
  billingAnalyticsQueryKey: ["billing", "analytics"],
  useBillingSummary: () => mocks.summary,
  usePlanGates: () => ({ loading: false, agentsAllowed: false, maxMembersPerProject: 2, projectLimitReached: false }),
}));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/components/icon", () => ({ AppIcon: () => null }));
vi.mock("@/components/app-link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/app-content-header", () => ({ AppContentHeader: () => null }));
vi.mock("@/components/billing/usage-section", () => ({ BillingLimits: () => null, UsageSection: () => null }));
vi.mock("@/components/billing/usage-history-section", () => ({ UsageHistorySection: () => null }));

import BillingPage from "@/app/(app)/billing/page";
import { NumoUsageExhaustedCard } from "@/components/assistant/usage-exhausted-card";
import { AgentsPlanGate } from "./agents-plan-gate";
import { PlanSection } from "./plan-section";

const PURCHASE_COPY = /upgrade|view plans|switch to|go to billing|manage subscription|€/i;

let host: HTMLDivElement;
let root: Root;

async function render(node: React.ReactNode) {
  await act(() => root.render(node));
  return host;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  delete window.Capacitor;
  vi.unstubAllGlobals();
});

function enterMobileApp(platform: "ios" | "android") {
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform };
}

const exhausted = { cause: "account", percent: 100, resetsAt: null, nextPlanId: "go", byok: false, routineId: null } as const;

describe("in a browser", () => {
  it("offers the plans where a limit is reached", async () => {
    expect((await render(<AgentsPlanGate>content</AgentsPlanGate>)).querySelector('a[href="/billing"]')).not.toBeNull();
    expect((await render(<NumoUsageExhaustedCard details={exhausted} />)).querySelector('a[href="/billing"]')).not.toBeNull();
    expect((await render(<PlanSection />)).textContent).toMatch(PURCHASE_COPY);
    await render(<BillingPage />);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe.each(["ios", "android"] as const)("in the %s app", (platform) => {
  beforeEach(() => enterMobileApp(platform));

  it("states that the plan lacks the feature, with no way to a purchase", async () => {
    const page = await render(<AgentsPlanGate>content</AgentsPlanGate>);
    expect(page.textContent).toContain(en.Billing.notOnPlan);
    expect(page.querySelector("a, button")).toBeNull();
    expect(page.textContent).not.toMatch(PURCHASE_COPY);
  });

  it("keeps the usage notice and its own-key option, without the upgrade", async () => {
    const card = await render(<NumoUsageExhaustedCard details={exhausted} />);
    expect(card.querySelector('a[href="/billing"]')).toBeNull();
    expect(card.querySelector('a[href="/settings?tab=ai"]')).not.toBeNull();
    expect(card.textContent).not.toMatch(PURCHASE_COPY);
  });

  it("renders no plan card", async () => {
    expect((await render(<PlanSection />)).innerHTML).toBe("");
  });

  it("leaves the billing page for the settings", async () => {
    const page = await render(<BillingPage />);
    expect(page.innerHTML).toBe("");
    expect(mocks.replace).toHaveBeenCalledWith("/settings");
  });
});
