// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog";
import { SearchSelect } from "../search-select";
import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";
import { MobileSheetScrollArea } from "./mobile-sheet";

// Import only the tested primitives; the package barrel also loads an emoji JSON bundle.
vi.mock("mangue-ui", async () => ({
  ...await import("../../node_modules/mangue-ui/src/components/ui/dialog"),
  ...await import("../../node_modules/mangue-ui/src/components/ui/sheet"),
  ...await import("../../node_modules/mangue-ui/src/components/ui/popover"),
  ...await import("../../node_modules/mangue-ui/src/components/ui/command"),
  ...await import("../../node_modules/mangue-ui/src/components/ui/button"),
  ...await import("../../node_modules/mangue-ui/src/lib/utils"),
  Spinner: () => null,
  toast: { error: vi.fn() },
}));
const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => viewport.mobile, MOBILE_LAYOUT_QUERY: "(max-width: 767px)" }));
vi.mock("@/components/ui/tooltip", async () => await import("../../node_modules/mangue-ui/src/components/ui/tooltip"));
import { TooltipProvider } from "../../node_modules/mangue-ui/src/components/ui/tooltip";
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  viewport.mobile = true;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: viewport.mobile }));
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
        <input aria-label="Issue title" autoFocus={allowInputAutoFocus()} />
        <SearchSelect value={null} onChange={selected} options={[{ value: "high", label: "High priority" }]}
          trigger={<button type="button">Priority</button>} />
      </DialogContent>
    </Dialog>;
  }
  await act(() => root.render(createElement(NextIntlClientProvider, { locale: "en", messages: { Common: { close: "Close" }, Picker: { search: "Search", noResults: "No results" } }, children: createElement(TooltipProvider, null, createElement(Form)) })));
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === text)!;
  await act(() => button("Open form").click());
  expect(document.querySelector('[data-mobile-dialog]')).not.toBeNull();
  expect(document.activeElement).toBe(document.querySelector('[data-mobile-dialog]'));
  await act(() => button("Priority").click());
  expect(document.querySelector('[data-mobile-picker]')).not.toBeNull();
  expect(document.querySelectorAll('[data-mobile-picker] [data-mobile-sheet-close]')).toHaveLength(1);
  expect(document.activeElement).toBe(document.querySelector('[data-mobile-picker]'));
  const search = document.querySelector<HTMLInputElement>('[data-mobile-picker] input')!;
  await act(() => search.focus());
  expect(document.activeElement).toBe(search);
  const option = document.querySelector<HTMLElement>('[cmdk-item]')!;
  await act(() => option.click());
  expect(selected).toHaveBeenCalledWith("high");
  expect(document.querySelector('[data-mobile-picker]')).toBeNull();
  expect(document.querySelector('[data-mobile-dialog]')).not.toBeNull();
  await act(() => button("Priority").click());
  await act(() => document.querySelector<HTMLElement>('[data-mobile-picker] [data-mobile-sheet-close]')!.click());
  expect(document.querySelector('[data-mobile-picker]')).toBeNull();
  expect(document.querySelectorAll('[data-mobile-dialog] [data-mobile-sheet-close]')).toHaveLength(1);
  await act(() => document.querySelector('[data-mobile-dialog]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true })));
  expect(keydown).toHaveBeenCalled();
  await act(() => document.querySelector('[data-mobile-dialog] [data-slot="sheet-close"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(document.querySelector('[data-mobile-dialog]')).toBeNull();
});

it.each([false, true])("forwards handlers and fades hidden content (asChild: %s)", async (asChild) => {
  const clicked = vi.fn();
  const scrolled = vi.fn();
  await act(() => root.render(<MobileSheetScrollArea asChild={asChild} onScroll={scrolled} className="list">
    {asChild ? <div data-slot-child><button onClick={clicked}>Choose option</button></div> : <button onClick={clicked}>Choose option</button>}
  </MobileSheetScrollArea>));
  const scroller = container.querySelector<HTMLDivElement>(".list")!;
  expect(scroller.hasAttribute("data-slot-child")).toBe(asChild);
  Object.defineProperties(scroller, { clientHeight: { value: 100 }, scrollHeight: { value: 300 } });
  const scroll = async (top: number) => {
    await act(() => { scroller.scrollTop = top; scroller.dispatchEvent(new Event("scroll")); });
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  };
  await scroll(0);
  expect(scrolled).toHaveBeenCalled();
  expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  await scroll(100);
  expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  await scroll(200);
  expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  await act(() => scroller.querySelector<HTMLButtonElement>("button")!.click());
  expect(clicked).toHaveBeenCalledOnce();
  expect(scroller.querySelector('[aria-hidden="true"]')).toBeNull();
});

it("closes a mobile view picker before opening its creation form", async () => {
  function Views() {
    const [creating, setCreating] = useState(false);
    return <>
      <SearchSelect value="all" onChange={() => {}} options={[{ value: "all", label: "All issues" }]}
        trigger={<button>Choose view</button>}
        menuActions={[{ id: "create", label: "New view", onSelect: () => setCreating(true) }]} />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>New view</DialogTitle>
          <input aria-label="View name" autoFocus={allowInputAutoFocus()} />
        </DialogContent>
      </Dialog>
    </>;
  }
  await act(() => root.render(createElement(NextIntlClientProvider, { locale: "en", messages: { Common: { close: "Close" }, Picker: { search: "Search", noResults: "No results" } }, children: createElement(TooltipProvider, null, createElement(Views)) })));
  await act(() => container.querySelector<HTMLButtonElement>("button")!.click());
  const action = [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((node) => node.textContent === "New view")!;
  await act(() => action.click());
  await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(document.querySelector('[data-mobile-picker]')).toBeNull();
  expect(document.querySelector('[data-mobile-dialog]')).not.toBeNull();
  expect(document.activeElement).toBe(document.querySelector('[data-mobile-dialog]'));
});

it("retains automatic input focus in desktop dialogs", async () => {
  viewport.mobile = false;
  await act(() => root.render(<Dialog open><DialogContent aria-describedby={undefined}>
    <DialogTitle>Rename view</DialogTitle><input aria-label="View name" autoFocus={allowInputAutoFocus()} />
  </DialogContent></Dialog>));
  expect(document.querySelector('[data-mobile-dialog]')).toBeNull();
  expect(document.activeElement).toBe(document.querySelector('input[aria-label="View name"]'));
});
