// @vitest-environment jsdom
//
// Escape closes the surface in front only (lib/escape-layers.ts): a menu that
// is not a Radix layer, open inside a dialog, closes alone.
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { useEscapeLayer } from "@/lib/escape-layers";

vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => false }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function Menu() {
  const [open, setOpen] = useState(true);
  useEscapeLayer(open, () => setOpen(false));
  return open ? <p data-testid="menu">menu</p> : null;
}

function Harness({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Notebook</DialogTitle>
        <Menu />
      </DialogContent>
    </Dialog>
  );
}

function escape() {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}

it("closes the menu first, then the dialog", async () => {
  const onOpenChange = vi.fn();
  await act(() => root.render(<Harness onOpenChange={onOpenChange} />));
  expect(document.querySelector("[data-testid=menu]")).not.toBeNull();
  await act(() => escape());
  expect(document.querySelector("[data-testid=menu]")).toBeNull();
  expect(onOpenChange).not.toHaveBeenCalled();
  await act(() => escape());
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
