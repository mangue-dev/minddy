// @vitest-environment jsdom

import { act, createElement, StrictMode, useCallback, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkActionsProvider, useBulkActions } from "./bulk-actions-context";
import { useBulkPaletteMode } from "./use-bulk-palette-mode";
import { useCommandPaletteLauncher } from "./use-command-palette-launcher";

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => analytics }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});

function Palette({ open, destinationOnly, onOpenChange }: {
  open: boolean;
  destinationOnly: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const showBulk = useBulkPaletteMode({ open, destinationOnly, onOpenChange });
  if (!open) return null;
  return createElement("button", {
    "data-palette-mode": showBulk ? "bulk" : destinationOnly ? "destination" : "default",
    onClick: () => onOpenChange(false),
  }, "Close palette");
}

function Shell({ lazy = false }: { lazy?: boolean }) {
  const { requestBulkActions } = useBulkActions();
  const [selected, setSelected] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(!lazy);
  const [mode, setMode] = useState("default");
  const handleLaunch = useCallback((next: boolean) => {
    setMounted(true);
    setMode("default");
    setOpen(next);
  }, []);
  const openDestination = useCallback(() => {
    setMounted(true);
    setMode("destination");
    setOpen(true);
  }, []);
  const handleContentOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setMode("default");
  }, []);
  useCommandPaletteLauncher({ open, onOpenChange: handleLaunch, onNewTab: openDestination });

  return createElement("div", null,
    createElement("button", { "data-action": "select", onClick: () => setSelected(true) }, "Select tickets"),
    createElement("button", { "data-action": "cancel", onClick: () => setSelected(false) }, "Cancel selection"),
    selected ? createElement("button", {
      "data-action": "bulk",
      onClick: () => requestBulkActions({
        count: 2, members: [], onUpdate: vi.fn(), onAskNumo: vi.fn(),
      }),
    }, "Selection actions") : null,
    createElement("button", { "data-action": "new-tab", onClick: openDestination }, "New tab"),
    mounted ? createElement(Palette, {
      key: mode, open, destinationOnly: mode === "destination", onOpenChange: handleContentOpenChange,
    }) : null,
  );
}

async function mount(lazy = false) {
  await act(() => root.render(createElement(StrictMode, null,
    createElement(BulkActionsProvider, null, createElement(Shell, { lazy })),
  )));
}

async function click(selector: string) {
  const button = container.querySelector<HTMLButtonElement>(selector);
  expect(button).not.toBeNull();
  await act(() => button!.click());
}

async function shortcut(key: string) {
  await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true })));
}

function paletteMode() {
  return container.querySelector("[data-palette-mode]")?.getAttribute("data-palette-mode");
}

describe("bulk palette launch lifecycle", () => {
  it.each(["button", "shortcut"])("opens destinations via %s after closing and cancelling a selection", async (source) => {
    await mount();
    await click('[data-action="select"]');
    await click('[data-action="bulk"]');
    expect(paletteMode()).toBe("bulk");
    await click("[data-palette-mode]");
    expect(paletteMode()).toBeUndefined();
    await click('[data-action="cancel"]');

    if (source === "button") await click('[data-action="new-tab"]');
    else await shortcut("t");
    expect(paletteMode()).toBe("destination");

    await click("[data-palette-mode]");
    expect(paletteMode()).toBeUndefined();
    await shortcut("k");
    expect(paletteMode()).toBe("default");
  });

  it("allows fresh bulk launches for the same selection after mode remounts", async () => {
    await mount();
    await click('[data-action="select"]');
    await click('[data-action="bulk"]');
    expect(paletteMode()).toBe("bulk");
    await click("[data-palette-mode]");
    await click('[data-action="new-tab"]');
    expect(paletteMode()).toBe("destination");
    await click("[data-palette-mode]");
    expect(paletteMode()).toBeUndefined();
    await click('[data-action="bulk"]');
    expect(paletteMode()).toBe("bulk");
    await shortcut("k");
    expect(paletteMode()).toBeUndefined();
    await shortcut("k");
    expect(paletteMode()).toBe("default");
  });

  it("handles a pending bulk launch when the lazy palette first mounts", async () => {
    await mount(true);
    await click('[data-action="select"]');
    await click('[data-action="bulk"]');
    expect(paletteMode()).toBe("bulk");
  });
});
