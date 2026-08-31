import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  summary: {
    loading: false,
    planId: "pro",
    status: {
      managedBilling: true,
      stripeConfigured: true,
      adminOverride: {
        expiresAt: "2026-09-29T12:00:00.000Z",
        basePlanId: "go",
      } as { expiresAt: string | null; basePlanId: "go" },
      subscription: {
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: "2026-09-10T12:00:00.000Z",
      } as {
        status: string;
        cancelAtPeriodEnd: boolean;
        currentPeriodEnd: string | null;
      } | null,
    },
  },
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () =>
    (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/use-billing-query", () => ({
  billingStatusQueryKey: ["billing", "status"],
  useBillingSummary: () => mocks.summary,
}));

vi.mock("mangue-ui", async () => {
  const React = await import("react");
  const Container = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const Button = ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: string;
    variant?: string;
  }) => React.createElement("button", props, children);

  return {
    AlertDialog: Container,
    AlertDialogAction: Button,
    AlertDialogCancel: Button,
    AlertDialogContent: Container,
    AlertDialogDescription: Container,
    AlertDialogFooter: Container,
    AlertDialogHeader: Container,
    AlertDialogTitle: Container,
    Button,
    cn: (...values: Array<string | false | null | undefined>) =>
      values.filter(Boolean).join(" "),
    toast: { error: vi.fn(), success: vi.fn() },
  };
});

const { PlanSection } = await import("@/components/billing/plan-section");

describe("PlanSection admin override", () => {
  beforeEach(() => {
    mocks.summary.status.adminOverride = {
      expiresAt: "2026-09-29T12:00:00.000Z",
      basePlanId: "go",
    };
    mocks.summary.status.subscription = {
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: "2026-09-10T12:00:00.000Z",
    };
  });

  it("replaces plan cards with the temporary override details", () => {
    const html = renderToStaticMarkup(createElement(PlanSection));

    expect(html).toContain("adminOverrideTitle");
    expect(html).toContain("adminOverrideTemporaryDescription");
    expect(html).toContain("planGo");
    expect(html).toContain("manageSubscription");
    expect(html).not.toContain("billingMonthly");
    expect(html).not.toContain("planDescFree");
  });

  it("shows an unlimited override without subscription management", () => {
    mocks.summary.status.adminOverride.expiresAt = null;
    mocks.summary.status.subscription = null;

    const html = renderToStaticMarkup(createElement(PlanSection));

    expect(html).toContain("adminOverrideUnlimitedDescription");
    expect(html).not.toContain("manageSubscription");
    expect(html).not.toContain("billingMonthly");
  });
});
