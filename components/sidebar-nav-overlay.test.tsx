// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SidebarNavOverlay } from "@/components/sidebar-nav-overlay";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, media: query, addEventListener() {}, removeEventListener() {},
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const panel = () => host.querySelector<HTMLElement>(".sidebar-nav-panel")!;
const trigger = () => host.querySelector<HTMLButtonElement>("[aria-haspopup]")!;

async function revealWithMenu(expanded: boolean) {
  await act(() => root.render(createElement(SidebarNavOverlay, {
    hidden: true,
    width: 320,
    dockedWidth: 320,
    children: createElement("button", { type: "button", "aria-haspopup": "menu", "aria-expanded": expanded }),
  })));
  await act(async () => {
    // jsdom has no PointerEvent; React and the document listener only read
    // the type and coordinates.
    host.querySelector(".sidebar-nav-hotzone")!.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 4, clientY: 40 }),
    );
  });
  expect(panel().dataset.open).toBe("true");
}

async function moveOutside() {
  await act(async () => {
    document.body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 700, clientY: 300 }));
  });
}

it("collapses the hover-revealed sidebar once the pointer leaves it", async () => {
  await revealWithMenu(false);
  await moveOutside();
  expect(panel().dataset.open).toBe("false");
});

it("stays open while a menu opened from it is open, then collapses when it closes", async () => {
  await revealWithMenu(true);
  await moveOutside();
  expect(panel().dataset.open).toBe("true");

  await act(async () => {
    trigger().setAttribute("aria-expanded", "false");
    // MutationObserver callbacks run as microtasks.
    await Promise.resolve();
  });
  expect(panel().dataset.open).toBe("false");
});
