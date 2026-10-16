// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { IssuePrChip } from "./issue-pr-chip";

vi.mock("mangue-ui", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span role="tooltip">{children}</span>,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (pr: Parameters<typeof IssuePrChip>[0]["pr"], onOpenPr = vi.fn()) =>
  act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}>
    <IssuePrChip pr={pr} onOpenPr={onOpenPr} />
  </NextIntlClientProvider>));

it("keeps an issue without a pull request silent", async () => {
  await render(null);
  expect(host.innerHTML).toBe("");
});

it("keeps a closed pull request silent", async () => {
  await render({ prId: "pr", prNumber: 4, state: "closed" });
  expect(host.innerHTML).toBe("");
});

it("opens a live pull request from the chip", async () => {
  const onOpenPr = vi.fn();
  await render({ prId: "pr", prNumber: 4, state: "open" }, onOpenPr);
  const button = host.querySelector("button")!;
  expect(button.getAttribute("aria-label")).toBe(messages.Agent.viewPullRequest);
  await act(() => button.click());
  expect(onOpenPr).toHaveBeenCalledOnce();
});
