// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog";
import { SearchSelect } from "../search-select";

// Import only the tested primitives; the package barrel also loads an emoji JSON bundle.
vi.mock("mangue-ui", async () => ({
  ...await import("../../node_modules/mangue-ui/src/components/ui/dialog"),
  ...await import("../../node_modules/mangue-ui/src/components/ui/sheet"),
  ...await import("../../node_modules/mangue-ui/src/components/ui/popover"),
  ...await import("../../node_modules/mangue-ui/src/components/ui/command"),
  ...await import("../../node_modules/mangue-ui/src/lib/utils"),
  Spinner: () => null,
  toast: { error: vi.fn() },
}));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => true }));
vi.mock("@/components/ui/tooltip", async () => await import("../../node_modules/mangue-ui/src/components/ui/tooltip"));
import { TooltipProvider } from "../../node_modules/mangue-ui/src/components/ui/tooltip";
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("keeps a parent form open while selecting from a nested mobile sheet", async () => {
  const selected = vi.fn();
  const keydown = vi.fn();
  function Form() {
    const [open, setOpen] = useState(false);
    return <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>Open form</DialogTrigger>
      <DialogContent onKeyDown={keydown} aria-describedby={undefined}>
        <DialogTitle>Create issue</DialogTitle>
        <SearchSelect value={null} onChange={selected} options={[{ value: "high", label: "High priority" }]}
          trigger={<button type="button">Priority</button>} />
      </DialogContent>
    </Dialog>;
  }
  await act(() => root.render(createElement(NextIntlClientProvider, { locale: "en", messages: { Picker: { search: "Search", noResults: "No results" } }, children: createElement(TooltipProvider, null, createElement(Form)) })));
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === text)!;
  await act(() => button("Open form").click());
  expect(document.querySelector('[data-mobile-dialog]')).not.toBeNull();
  await act(() => button("Priority").click());
  expect(document.querySelector('[data-mobile-picker]')).not.toBeNull();
  const option = document.querySelector<HTMLElement>('[cmdk-item]')!;
  await act(() => option.click());
  expect(selected).toHaveBeenCalledWith("high");
  expect(document.querySelector('[data-mobile-picker]')).toBeNull();
  expect(document.querySelector('[data-mobile-dialog]')).not.toBeNull();
  await act(() => document.querySelector('[data-mobile-dialog]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true })));
  expect(keydown).toHaveBeenCalled();
  await act(() => document.querySelector('[data-mobile-dialog] [data-slot="sheet-close"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(document.querySelector('[data-mobile-dialog]')).toBeNull();
});
