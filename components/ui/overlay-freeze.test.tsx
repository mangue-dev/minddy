// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";
import { useMountedWhileClosing } from "./overlay-freeze";

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  // jsdom runs no CSS: give the menu an exit animation, so Radix keeps the
  // closed menu mounted until it ends, as in the browser.
  const styles = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const computed = styles(element, pseudo);
    if (element.getAttribute("role") !== "menu") return computed;
    Object.defineProperty(computed, "animationName", {
      get: () => (element.getAttribute("data-state") === "closed" ? "exit" : "enter"),
    });
    return computed;
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A menu whose caller clears what it shows as soon as it closes. */
function ResettingMenu({ open, row }: { open: boolean; row: string | null }) {
  return (
    <DropdownMenu open={open}>
      <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>{row ?? "empty"}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("useFrozenWhileClosed", () => {
  it("keeps a closing menu on the rows it showed open", async () => {
    await act(async () => root.render(<ResettingMenu open row="Rename" />));
    expect(document.querySelector('[role="menuitem"]')?.textContent).toBe("Rename");

    await act(async () => root.render(<ResettingMenu open={false} row={null} />));
    const menu = document.querySelector('[role="menu"]');
    expect(menu?.getAttribute("data-state")).toBe("closed");
    expect(menu?.querySelector('[role="menuitem"]')?.textContent).toBe("Rename");
  });

  it("shows the live rows again once reopened", async () => {
    await act(async () => root.render(<ResettingMenu open row="Rename" />));
    await act(async () => root.render(<ResettingMenu open={false} row={null} />));
    await act(async () => root.render(<ResettingMenu open row="Archive" />));
    expect(document.querySelector('[role="menuitem"]')?.textContent).toBe("Archive");
  });
});

describe("useMountedWhileClosing", () => {
  it("stays mounted through the exit, then unmounts", async () => {
    vi.useFakeTimers();
    let setOpen!: (open: boolean) => void;
    function Probe() {
      const [open, set] = useState(false);
      setOpen = set;
      return useMountedWhileClosing(open) ? <span data-probe /> : null;
    }
    await act(async () => root.render(<Probe />));
    expect(document.querySelector("[data-probe]")).toBeNull();
    await act(async () => setOpen(true));
    expect(document.querySelector("[data-probe]")).not.toBeNull();
    await act(async () => setOpen(false));
    expect(document.querySelector("[data-probe]")).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(300));
    expect(document.querySelector("[data-probe]")).toBeNull();
    vi.useRealTimers();
  });
});
