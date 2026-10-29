// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command, CommandItem, CommandList } from "./command";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = () => {};
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function moveOverSecond(pointerType: string) {
  await act(async () => {
    root.render(
      <Command>
        <CommandList>
          <CommandItem value="first">First</CommandItem>
          <CommandItem value="second">Second</CommandItem>
        </CommandList>
      </Command>,
    );
  });
  const second = container.querySelector<HTMLElement>('[data-value="second"]')!;
  await act(async () => {
    // jsdom has no PointerEvent: a mouse event carrying the field React reads.
    const event = new MouseEvent("pointermove", { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    second.dispatchEvent(event);
  });
  return second;
}

// MIN-836: cmdk moves its highlight on `pointermove` for every pointer type,
// which lit rows under a finger like a hover.
describe("Command pointer selection", () => {
  it("follows a mouse", async () => {
    const second = await moveOverSecond("mouse");
    expect(second.getAttribute("data-selected")).toBe("true");
  });

  it.each(["touch", "pen"])("ignores a %s pointer", async (pointerType) => {
    const second = await moveOverSecond(pointerType);
    expect(second.getAttribute("data-selected")).toBe("false");
    expect(container.querySelector('[data-value="first"]')?.getAttribute("data-selected")).toBe("true");
  });
});
