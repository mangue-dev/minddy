// @vitest-environment jsdom

import { act, createElement, useCallback, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkActionsProvider } from "./bulk-actions-context";
import { usePaletteStore } from "./command-palette/store";
import {
  dismissPalettePicker,
  publishPalettePicker,
  releasePalettePicker,
  usePalettePicker,
  usePalettePickerMode,
  usePalettePickerStore,
  type PalettePickerRequest,
} from "./palette-picker";
import { useCommandPaletteLauncher } from "./use-command-palette-launcher";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => ({ track: vi.fn() }) }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  usePalettePickerStore.setState({ request: null, owner: null, openSignal: 0, dismissed: null });
  usePaletteStore.getState().reset();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});

function request(key: string, onClose = vi.fn()): PalettePickerRequest {
  return { key, placeholder: `Pick for ${key}…`, categories: [{ id: "rows", label: "Rows" }], items: [], onClose };
}

describe("palette picker store", () => {
  it("opens once per picker, not on its owner's updates", () => {
    const owner = Symbol("surface");
    publishPalettePicker(owner, request("type"));
    expect(usePalettePickerStore.getState().openSignal).toBe(1);
    // The next step of the same surface replaces the rows in place.
    publishPalettePicker(owner, request("target"));
    expect(usePalettePickerStore.getState()).toMatchObject({ openSignal: 1, request: { key: "target" } });
    // Another surface, or the same one after a close, opens it again.
    publishPalettePicker(Symbol("other"), request("other"));
    expect(usePalettePickerStore.getState().openSignal).toBe(2);
  });

  it("only lets the owner withdraw its picker", () => {
    const owner = Symbol("surface");
    publishPalettePicker(owner, request("pages"));
    releasePalettePicker(Symbol("stranger"));
    expect(usePalettePickerStore.getState().request?.key).toBe("pages");
    releasePalettePicker(owner);
    expect(usePalettePickerStore.getState().request).toBeNull();
  });

  it("tells the surface when the palette closes, once", () => {
    const onClose = vi.fn();
    publishPalettePicker(Symbol("surface"), request("pages", onClose));
    dismissPalettePicker();
    dismissPalettePicker();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(usePalettePickerStore.getState().request).toBeNull();
  });

  it("ignores a dismissed surface until it withdraws its picker", () => {
    const owner = Symbol("surface");
    publishPalettePicker(owner, request("pages"));
    dismissPalettePicker();
    // A render before the surface's own close lands must not reopen it.
    publishPalettePicker(owner, request("pages"));
    expect(usePalettePickerStore.getState()).toMatchObject({ request: null, openSignal: 1 });
    releasePalettePicker(owner);
    publishPalettePicker(owner, request("pages"));
    expect(usePalettePickerStore.getState()).toMatchObject({ request: { key: "pages" }, openSignal: 2 });
  });
});

function Surface({ open, step = "type" }: { open: boolean; step?: string }) {
  usePalettePicker(open ? request(step) : null);
  return null;
}

describe("usePalettePicker", () => {
  it("publishes while open and withdraws on close or unmount", async () => {
    await act(() => root.render(createElement(Surface, { open: true })));
    expect(usePalettePickerStore.getState().request?.key).toBe("type");
    await act(() => root.render(createElement(Surface, { open: false })));
    expect(usePalettePickerStore.getState().request).toBeNull();
    await act(() => root.render(createElement(Surface, { open: true, step: "blocks" })));
    expect(usePalettePickerStore.getState().request?.key).toBe("blocks");
    await act(() => root.render(null));
    expect(usePalettePickerStore.getState().request).toBeNull();
  });
});

/** The app shell (launcher + lazily mounted palette) with one picker surface. */
function Shell({ onSurfaceClose }: { onSurfaceClose: () => void }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [surfaceOpen, setSurfaceOpen] = useState(false);
  const [step, setStep] = useState("type");
  const handleLaunch = useCallback((next: boolean) => {
    setMounted(true);
    setOpen(next);
  }, []);
  useCommandPaletteLauncher({ open, onOpenChange: handleLaunch });
  usePalettePicker(surfaceOpen ? {
    ...request(step),
    onClose: () => {
      setSurfaceOpen(false);
      setStep("type");
      onSurfaceClose();
    },
  } : null);
  return createElement("div", null,
    createElement("button", { onClick: () => setSurfaceOpen(true) }, "Open surface picker"),
    createElement("button", { onClick: () => setStep("blocks") }, "Next step"),
    createElement("button", { onClick: () => setSurfaceOpen(false) }, "Withdraw picker"),
    mounted ? createElement(Palette, { open, onOpenChange: setOpen }) : null,
  );
}

function Palette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const picker = usePalettePickerMode({ open, destinationOnly: false, onOpenChange });
  if (!open) return null;
  return createElement("div", { "data-palette": picker?.key ?? "search" },
    createElement("button", { onClick: () => onOpenChange(false) }, "Close palette"));
}

const button = (label: string) => [...container.querySelectorAll("button")].find((node) => node.textContent === label)!;
const palette = () => container.querySelector("[data-palette]");

describe("palette picker mode", () => {
  it("opens the not-yet-loaded palette on the picker and resets the surface on close", async () => {
    const onSurfaceClose = vi.fn();
    await act(() => root.render(createElement(BulkActionsProvider, null, createElement(Shell, { onSurfaceClose }))));
    expect(palette()).toBeNull();
    await act(() => button("Open surface picker").click());
    expect(palette()?.getAttribute("data-palette")).toBe("type");

    usePaletteStore.getState().setQuery("blo");
    await act(() => button("Next step").click());
    expect(palette()?.getAttribute("data-palette")).toBe("blocks");
    // A new step starts from an empty query.
    expect(usePaletteStore.getState().query).toBe("");

    await act(() => button("Close palette").click());
    expect(palette()).toBeNull();
    expect(onSurfaceClose).toHaveBeenCalledTimes(1);
    expect(usePalettePickerStore.getState().request).toBeNull();

    // The surface can open it again.
    await act(() => button("Open surface picker").click());
    expect(palette()?.getAttribute("data-palette")).toBe("type");
  });

  it("closes the palette when the surface withdraws its picker", async () => {
    const onSurfaceClose = vi.fn();
    await act(() => root.render(createElement(BulkActionsProvider, null, createElement(Shell, { onSurfaceClose }))));
    await act(() => button("Open surface picker").click());
    await act(() => button("Withdraw picker").click());
    expect(palette()).toBeNull();
    // The surface closed itself: it is not called back.
    expect(onSurfaceClose).not.toHaveBeenCalled();
  });

  it("keeps the new-tab launcher free of pickers", async () => {
    publishPalettePicker(Symbol("surface"), request("pages"));
    function Destination() {
      const picker = usePalettePickerMode({ open: true, destinationOnly: true, onOpenChange: vi.fn() });
      return createElement("span", null, picker ? "picker" : "destinations");
    }
    await act(() => root.render(createElement(Destination)));
    expect(container.textContent).toBe("destinations");
  });
});
