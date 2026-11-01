// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { IssueContextMenu } from "@/components/issue-context-menu";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/search-menu", () => ({
  DropdownSearchRow: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  searchInputClass: "",
}));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("context menu search across submenus", () => {
  it("lists a submenu entry behind its path and selects it with Enter", async () => {
    const blockedBy = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(() => root.render(createElement(IssueContextMenu, {
        position: { x: 10, y: 10 },
        onClose: vi.fn(),
        actions: [
          { id: "copy", label: "Copy identifier", onSelect: vi.fn() },
          {
            id: "relations",
            label: "Relations",
            children: [
              { id: "blocks", label: "Blocks", onSelect: vi.fn() },
              { id: "blocked-by", label: "Blocked by", onSelect: blockedBy },
            ],
          },
        ],
      })));
      await act(nextFrame);
      const input = document.querySelector("input")!;
      await act(() => type(input, "blocked"));
      const rows = [...document.querySelectorAll('[role="menuitem"]')];
      expect(rows.map((row) => row.textContent)).toEqual(["RelationsBlocked by"]);
      expect(rows[0].querySelector("svg")).not.toBeNull();

      await act(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await act(nextFrame);
      expect(blockedBy).toHaveBeenCalledTimes(1);
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  });

  it("builds the entries from the query and keeps the fallback entry first, then last", async () => {
    const ask = vi.fn();
    const toggled = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(() => root.render(createElement(IssueContextMenu, {
        position: { x: 10, y: 10 },
        onClose: vi.fn(),
        actions: (query: string) => [
          { id: "numo", label: query ? `Create with Numo: ${query}` : "Create with Numo", searchFallback: true, onSelect: () => ask(query) },
          {
            id: "priority",
            label: "Priority",
            children: [
              { id: "high", label: "High", keepOpen: true, checked: true, onSelect: toggled },
              { id: "low", label: "Low", keepOpen: true, onSelect: toggled },
            ],
          },
        ],
      })));
      await act(nextFrame);
      const labels = () => [...document.querySelectorAll('[role="menuitem"]')].map((row) => row.textContent);
      expect(labels()).toEqual(["Create with Numo", "Priority"]);

      const input = document.querySelector("input")!;
      await act(() => type(input, "high"));
      expect(labels()).toEqual(["PriorityHigh", "Create with Numo: high"]);

      // Enter picks the first match: a toggle, which keeps the menu open.
      await act(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(toggled).toHaveBeenCalledTimes(1);
      expect(document.querySelector("input")).not.toBeNull();

      // A query nothing matches leaves the fallback alone, and Enter sends it.
      await act(() => type(input, "only urgent bugs"));
      expect(labels()).toEqual(["Create with Numo: only urgent bugs"]);
      await act(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await act(nextFrame);
      expect(ask).toHaveBeenCalledWith("only urgent bugs");
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  });
});
