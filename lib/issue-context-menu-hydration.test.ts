// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { IssueContextMenu } from "@/components/issue-context-menu";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
// Exercise the real Radix-backed dropdown without loading unrelated emoji assets.
vi.mock("mangue-ui", async () => ({
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/dropdown-menu.tsx"),
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));
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

describe("pointer menu hydration", () => {
  it.each([null, { x: 120, y: 240 }])("hydrates without replacing the surrounding shell when position is %j", async (position) => {
    const onRecoverableError = vi.fn();
    const tree = createElement("section", null,
      createElement("button", null, "Existing sidebar row"),
      createElement(IssueContextMenu, {
        position,
        onClose: vi.fn(),
        actions: [{ id: "edit", label: "Edit", onSelect: vi.fn() }],
        searchable: false,
      }));
    const browserDocument = document;
    let html: string;
    vi.stubGlobal("document", undefined);
    try {
      html = renderToString(tree);
    } finally {
      vi.stubGlobal("document", browserDocument);
    }
    const host = document.createElement("div");
    document.body.append(host);
    host.innerHTML = html;
    const row = host.querySelector("button");
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(host, tree, { onRecoverableError });
        await nextFrame();
      });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(host.querySelector("button")).toBe(row);
      expect(document.querySelector('[data-slot="dropdown-menu-trigger"]')).not.toBeNull();
      expect(Boolean(document.querySelector('[role="menu"]'))).toBe(Boolean(position));
    } finally {
      await act(() => root?.unmount());
      host.remove();
    }
  });

  it("retains pointer placement, keyboard selection, and Escape after hydration", async () => {
    const selected = vi.fn();
    function Surface() {
      const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
      return createElement("section", null,
        createElement("button", {
          onContextMenu: (event) => {
            event.preventDefault();
            setPosition({ x: event.clientX, y: event.clientY });
          },
        }, "Open actions"),
        createElement(IssueContextMenu, {
          position,
          onClose: () => setPosition(null),
          actions: [{ id: "edit", label: "Edit", onSelect: selected }],
        }));
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const open = async () => {
      await act(() => {
        host.querySelector("button")!.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true, clientX: 120, clientY: 240,
        }));
      });
      await act(nextFrame);
    };
    try {
      await act(() => root.render(createElement(Surface)));
      await open();
      const anchor = document.querySelector<HTMLElement>('[data-slot="dropdown-menu-trigger"]')!;
      expect(anchor.style.left).toBe("120px");
      expect(anchor.style.top).toBe("240px");
      const input = document.querySelector("input")!;
      expect(document.activeElement).toBe(input);
      await act(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      });
      expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
      await act(() => {
        document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await act(nextFrame);
      expect(selected).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).not.toBe(anchor);

      await open();
      await act(() => {
        document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(document.querySelector('[role="menu"]')).toBeNull();
      expect(selected).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[data-slot="dropdown-menu-trigger"]')).toBe(anchor);
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  });
});
