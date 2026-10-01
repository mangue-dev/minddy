// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/components/ui/kbd", () => ({ Kbd: () => null }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
}));
vi.mock("mangue-ui", async () => {
  const popover = await vi.importActual<Record<string, React.ElementType>>("mangue-ui/components/ui/popover.tsx");
  const { Command } = await import("cmdk");
  return {
    cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
    Command, CommandList: Command.List, CommandEmpty: Command.Empty,
    CommandSeparator: Command.Separator,
    ...popover,
  };
});

import { SearchMenu } from "@/components/search-menu";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it.each(["trigger", "position"] as const)("locks body-portaled %s menus only while their modal is open", async (mode) => {
  const render = (open: boolean) => root.render(React.createElement(SearchMenu, {
    open, modal: true, onOpenChange: vi.fn(),
    ...(mode === "trigger" ? { trigger: React.createElement("button", null, "Relations") } : { position: { x: 20, y: 20 } }),
    children: React.createElement("div", null, "Candidate"),
  }));
  for (let opening = 0; opening < 2; opening++) {
    await act(() => render(true));
    const menu = document.querySelector("[data-floating-surface]")!;
    expect(menu).not.toBeNull();
    expect(host.contains(menu)).toBe(false);
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(true);
    await act(() => render(false));
    expect(document.querySelector("[data-floating-surface]")).toBeNull();
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
  }
});

it("keeps ordinary field menus non-modal by default", async () => {
  await act(() => root.render(React.createElement(SearchMenu, {
    open: true, onOpenChange: vi.fn(), trigger: React.createElement("button", null, "Status"),
    children: React.createElement("div", null, "Backlog"),
  })));
  expect(document.querySelector("[data-floating-surface]")).not.toBeNull();
  expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
});
