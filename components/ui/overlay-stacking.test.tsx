// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { SidePanel, SidePanelContent, SidePanelTitle } from "./side-panel";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";

vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => false, MOBILE_LAYOUT_QUERY: "(max-width: 1023px)" }));

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  // jsdom lays nothing out: count every connected overlay as visible.
  Object.defineProperty(Element.prototype, "checkVisibility", {
    configurable: true,
    value(this: Element) {
      return this.isConnected;
    },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  delete (Element.prototype as Partial<Element>).checkVisibility;
});

type Overlay = "panel" | "dialog";

/** A page popover, and an overlay that opens without a pointer (a shortcut). */
function Page({ overlay, keepPopoverOnFocusOut = false, expose, panelChildren }: {
  overlay: Overlay;
  keepPopoverOnFocusOut?: boolean;
  expose: (open: (next: boolean) => void) => void;
  panelChildren?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  expose(setOpen);
  return (
    <>
      <Popover>
        <PopoverTrigger>Labels</PopoverTrigger>
        <PopoverContent
          data-testid="page-popover"
          onFocusOutside={keepPopoverOnFocusOut ? (event) => event.preventDefault() : undefined}
        >
          <input aria-label="Filter labels" />
        </PopoverContent>
      </Popover>
      <p data-testid="outside">Board</p>
      {overlay === "panel" ? (
        <SidePanel open={open} onOpenChange={setOpen}>
          <SidePanelContent data-testid="overlay" aria-describedby={undefined} onInteractOutside={keepOverlayOpenForPopper}>
            <SidePanelTitle>MIN-1</SidePanelTitle>
            {panelChildren}
          </SidePanelContent>
        </SidePanel>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            data-testid="overlay"
            aria-describedby={undefined}
            onInteractOutside={keepOverlayOpenForPopper}
            // Like the issue side panel: nothing is focused on open.
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <DialogTitle>New issue</DialogTitle>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

async function render(props: Omit<Parameters<typeof Page>[0], "expose">) {
  let setOpen!: (next: boolean) => void;
  await act(() =>
    root.render(
      <NextIntlClientProvider locale="en" messages={{ Common: { close: "Close" } }}>
        <Page {...props} expose={(open) => (setOpen = open)} />
      </NextIntlClientProvider>,
    ),
  );
  return { openOverlay: () => act(() => setOpen(true)) };
}

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === text)!;

async function openPagePopover() {
  await act(() => button("Labels").click());
  // Focus inside the popover, as when typing in a picker's search field.
  await act(() => document.querySelector<HTMLInputElement>('[aria-label="Filter labels"]')!.focus());
  expect(byTestId("page-popover")).not.toBeNull();
}

async function pressOutside() {
  const target = byTestId("outside")!;
  await act(async () => {
    for (const type of ["pointerdown", "pointerup", "click"]) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pressEscape() {
  await act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
}

it.each<Overlay>(["panel", "dialog"])("closes a page popover when a %s opens over it without taking focus", async (overlay) => {
  const { openOverlay } = await render({ overlay });
  await openPagePopover();
  await openOverlay();

  expect(byTestId("overlay")).not.toBeNull();
  expect(byTestId("page-popover")).toBeNull();
  expect(document.activeElement).toBe(byTestId("overlay"));

  await pressOutside();
  expect(byTestId("overlay")).toBeNull();
  expect(document.body.style.pointerEvents).toBe("");
});

it("closes the overlay with a single Escape once the popover below is gone", async () => {
  const { openOverlay } = await render({ overlay: "panel" });
  await openPagePopover();
  await openOverlay();

  await pressEscape();
  expect(byTestId("overlay")).toBeNull();
  expect(byTestId("page-popover")).toBeNull();
});

it("lets an outside click close the overlay even when a popover below refuses to close", async () => {
  const { openOverlay } = await render({ overlay: "panel", keepPopoverOnFocusOut: true });
  await openPagePopover();
  await openOverlay();
  expect(byTestId("page-popover")).not.toBeNull();

  await pressOutside();
  expect(byTestId("overlay")).toBeNull();
});

it("still keeps the overlay open while one of its own popovers is dismissed", async () => {
  const { openOverlay } = await render({
    overlay: "panel",
    panelChildren: (
      <Popover>
        <PopoverTrigger>Priority</PopoverTrigger>
        <PopoverContent data-testid="panel-popover">High</PopoverContent>
      </Popover>
    ),
  });
  await openOverlay();
  await act(() => button("Priority").click());
  expect(byTestId("panel-popover")).not.toBeNull();

  await pressOutside();
  expect(byTestId("panel-popover")).toBeNull();
  expect(byTestId("overlay")).not.toBeNull();

  await pressOutside();
  expect(byTestId("overlay")).toBeNull();
});
