// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageHistoryResponse } from "@/lib/billing-types";

const mocks = vi.hoisted(() => ({ fetchHistory: vi.fn() }));
vi.mock("@/lib/billing-api", () => ({
  fetchUsageHistoryApi: mocks.fetchHistory,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/use-billing-query", () => ({
  useBillingSummary: () => ({
    includedUsd: 15,
    usageError: false,
    usage: {
      managedAi: true,
      periodStart: "2026-09-10",
      nextResetAt: "2026-10-10",
    },
  }),
  formatBudgetPercent: () => "1%",
}));
vi.mock("@/components/icon", () => ({ AppIcon: () => null }));
vi.mock("@/components/empty-state", () => ({
  EmptyState: ({ description }: { description: string }) =>
    createElement("p", null, description),
}));
vi.mock("@/components/billing/usage-budget", () => ({
  UsageLoadError: ({ onRetry }: { onRetry: () => void }) =>
    createElement(
      "div",
      { role: "alert" },
      "usageLoadFailed",
      createElement("button", { onClick: onRetry }, "retryUsage"),
    ),
}));
vi.mock("mangue-ui", () => {
  const Container = ({ children }: { children?: ReactNode }) => children;
  const Button = ({
    children,
    onClick,
    disabled,
    "aria-label": label,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) =>
    createElement(
      "button",
      { onClick, disabled, "aria-label": label },
      children,
    );
  return {
    Button,
    Collapsible: Container,
    CollapsibleContent: Container,
    CollapsibleTrigger: Button,
    Select: Container,
    SelectContent: Container,
    SelectItem: Container,
    SelectTrigger: Button,
    SelectValue: () => null,
    cn: (...values: Array<string | boolean | null | undefined>) =>
      values.filter(Boolean).join(" "),
  };
});

const { UsageHistorySection } = await import(
  "@/components/billing/usage-history-section"
);
const history: UsageHistoryResponse = {
  total: 26,
  entries: [
    {
      runId: "run-1",
      segmentId: "agents",
      feature: "agent_code",
      at: "2026-10-02T12:00:00Z",
      projectName: "Loaded project",
      usd: 0.15,
    },
  ],
};
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  focusManager.setFocused(true);
  mocks.fetchHistory.mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  container.remove();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function renderHistory() {
  await act(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(UsageHistorySection),
      ),
    ),
  );
  await act(() => vi.advanceTimersByTimeAsync(1));
}
async function failNextPoll() {
  mocks.fetchHistory.mockRejectedValueOnce(
    new Error("Temporary network failure"),
  );
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(mocks.fetchHistory).toHaveBeenCalledTimes(2);
}

describe("usage history refresh failures", () => {
  it("preserves loaded rows and pagination when the 60-second poll fails", async () => {
    mocks.fetchHistory.mockResolvedValueOnce(history);
    await renderHistory();
    expect(container.textContent).toContain("Loaded project");
    await failNextPoll();
    expect(container.textContent).toContain("Loaded project");
    expect(
      container.querySelector('[aria-label="historyNext"]'),
    ).not.toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "usageRefreshFailed",
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("retains a successfully loaded empty history after a failed poll", async () => {
    mocks.fetchHistory.mockResolvedValueOnce({ total: 0, entries: [] });
    await renderHistory();
    await failNextPoll();
    expect(container.textContent).toContain("historyEmpty");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "usageRefreshFailed",
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows the initial-load error and can retry when no cached history exists", async () => {
    mocks.fetchHistory.mockRejectedValueOnce(
      new Error("Initial network failure"),
    );
    await renderHistory();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "usageLoadFailed",
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
    mocks.fetchHistory.mockResolvedValueOnce(history);
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[role="alert"] button')!
        .click();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(container.textContent).toContain("Loaded project");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
