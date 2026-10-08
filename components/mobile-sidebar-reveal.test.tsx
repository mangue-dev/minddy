// @vitest-environment jsdom
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import { MobileSidebarReveal } from "./mobile-sidebar-reveal";

vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => true }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let clicks: Mock<() => void>;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); clicks = vi.fn();
  function Demo() {
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null), focus = useRef<HTMLElement>(null);
    return <div className="app-shell">
      <button ref={trigger} onClick={() => setOpen(true)}>Open</button>
      <a data-link onClick={() => clicks()}><span data-content>Page content</span></a>
      <input data-input />
      <div data-carousel><span data-slide>Slide</span></div>
      <div data-horizontal style={{ overflowX: "auto" }}><span data-cell>Table cell</span></div>
      <div data-mobile-gesture-lock><span data-drag>Drag</span></div>
      <MobileSidebarReveal open={open} onOpenChange={setOpen} trigger={trigger} focusTarget={focus} label="Navigation">
        <aside ref={focus} tabIndex={-1}><button data-drawer>Destination</button></aside>
      </MobileSidebarReveal>
    </div>;
  }
  await act(() => root.render(<Demo />));
  Object.defineProperties(host.querySelector("[data-horizontal]"), { clientWidth: { value: 200 }, scrollWidth: { value: 500 } });
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const opened = () => document.querySelector('[data-mobile-sidebar-dialog][data-state="open"]');
async function pointer(selector: string, type: string, x: number, y: number, primary = true, click = false) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerType: { value: "touch" }, isPrimary: { value: primary }, pointerId: { value: 1 } });
  await act(() => { const node = document.querySelector<HTMLElement>(selector)!; node.dispatchEvent(event); if (click) node.click(); });
}
async function swipe(selector: string, x = 180, y = 200, dx = 380, dy = 0, click = false) {
  await pointer(selector, "pointerdown", x, y);
  await pointer(selector, "pointermove", x + dx, y + dy);
  await pointer(selector, "pointerup", x + dx, y + dy, true, click);
}
it("opens from page links in the middle of the viewport, suppresses the swipe click and closes from the drawer", async () => {
  await swipe("[data-content]", 180, 200, 380, 0, true);
  expect(opened()).not.toBeNull();
  expect(host.querySelector<HTMLElement>(".app-shell")!.inert).toBe(true);
  expect(clicks).not.toHaveBeenCalled();
  await swipe("[data-drawer]", 300, 200, -380);
  expect(opened()).toBeNull();
  expect(host.querySelector<HTMLElement>(".app-shell")!.inert).toBe(false);
});
it("preserves editors, horizontal scrolling, carousels, drag surfaces and vertical movement", async () => {
  for (const selector of ["[data-input]", "[data-slide]", "[data-cell]", "[data-drag]"]) {
    await swipe(selector);
    expect(opened()).toBeNull();
  }
  await swipe("[data-content]", 180, 200, 15, 120);
  expect(opened()).toBeNull();
  await swipe("[data-content]", 180, 200, -140);
  expect(opened()).toBeNull();
});
it("cancels a partial reveal when another finger joins or the pointer is canceled", async () => {
  await pointer("[data-content]", "pointerdown", 180, 200);
  await pointer("[data-content]", "pointermove", 220, 200);
  expect(opened()).not.toBeNull();
  await pointer("[data-content]", "pointerdown", 230, 210, false);
  expect(opened()).toBeNull();
  await pointer("[data-content]", "pointerup", 450, 200);
  expect(opened()).toBeNull();
  await pointer("[data-content]", "pointerdown", 180, 200);
  await pointer("[data-content]", "pointermove", 220, 200);
  await pointer("[data-content]", "pointercancel", 450, 200);
  expect(opened()).toBeNull();
});
