// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSearchScope, DropdownMenuTrigger } from "./dropdown-menu";

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let picker: HTMLInputElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  // jsdom runs no CSS: give the menu the enter and exit animations of
  // `data-open:animate-in` / `data-closed:animate-out`, so Radix keeps the
  // closed menu mounted until the exit animation ends, as in the browser.
  const styles = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const computed = styles(element, pseudo);
    if (element.getAttribute("role") !== "menu") return computed;
    // Live, like the browser's: Radix keeps this object and reads it again on close.
    Object.defineProperty(computed, "animationName", {
      get: () => (element.getAttribute("data-state") === "closed" ? "exit" : "enter"),
    });
    return computed;
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  // The surface a menu item opened, holding the focus.
  picker = document.createElement("input");
  document.body.appendChild(picker);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  picker.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderMenu(open: boolean) {
  await act(async () => {
    root.render(
      <DropdownMenu open={open}>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Link an objective</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
  });
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].at(-1)!;
}

// jsdom has no PointerEvent: a mouse event carrying the field Radix reads.
// React derives `onPointerLeave` from `pointerout`.
async function pointer(target: HTMLElement, type: "pointermove" | "pointerout") {
  await act(async () => {
    const event = new MouseEvent(type, { bubbles: true, relatedTarget: type === "pointerout" ? picker : null });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    target.dispatchEvent(event);
  });
}

// MIN-833: a field picker opened from a card's right-click menu closed at
// once — the pointer left the clicked item as the picker appeared under it,
// and the closing menu took the focus back from the picker.
describe("DropdownMenu focus while closing", () => {
  it("focuses the item under a moving mouse while open", async () => {
    const item = await renderMenu(true);
    await pointer(item, "pointermove");
    expect(document.activeElement).toBe(item);
  });

  it.each(["pointermove", "pointerout"] as const)("takes no focus on %s once closed", async (type) => {
    await renderMenu(true);
    const item = await renderMenu(false);
    expect(item.closest('[role="menu"]')?.getAttribute("data-state")).toBe("closed");
    picker.focus();
    await pointer(item, type);
    expect(document.activeElement).toBe(picker);
  });
});

describe("DropdownMenuSearchScope", () => {
  it.each(["pointermove", "pointerout"] as const)("leaves the search field focused on %s over an option", async (type) => {
    let search!: HTMLInputElement;
    await act(async () => {
      root.render(
        <DropdownMenu open>
          <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSearchScope>
              <input ref={(node) => { if (node) search = node; }} aria-label="Search" />
              <DropdownMenuItem>Link an objective</DropdownMenuItem>
            </DropdownMenuSearchScope>
          </DropdownMenuContent>
        </DropdownMenu>,
      );
    });
    const item = document.querySelector<HTMLElement>('[role="menuitem"]')!;
    search.focus();
    await pointer(item, type);
    expect(document.activeElement).toBe(search);
  });
});
