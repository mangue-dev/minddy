// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyboardProvider } from "./keyboard-context";

const state = vi.hoisted(() => ({
  activate: vi.fn(), reuseDestination: vi.fn(), dialog: false,
  activeId: "one", busy: false,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/home" }));
vi.mock("@/lib/app-tabs-context", () => ({ useOptionalAppTabSession: () => ({
  activate: state.activate, reuseDestination: state.reuseDestination,
  getSnapshot: () => ({ activeId: state.activeId, busy: state.busy, tabs: [{ id: "one" }, { id: "two" }] }),
}) }));
vi.mock("@/lib/inbox-launcher", () => ({ openInbox: vi.fn() }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantPanelActions: () => ({ toggle: vi.fn() }) }));
vi.mock("@/lib/sidebar-visibility-context", () => ({ useSidebarVisibility: () => ({ toggle: vi.fn() }) }));
vi.mock("@/lib/scratchpad-context", () => ({ useScratchpad: () => ({ open: vi.fn() }) }));
vi.mock("@/lib/secondary-sidebar-context", () => ({ useSecondarySidebar: () => ({ present: false }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/visible-overlays", () => ({
  hasVisibleOpenDialog: () => state.dialog, isVisibleOverlay: () => true,
}));

let root: Root;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.dialog = false;
  state.busy = false;
  state.activeId = "one";
  document.body.innerHTML = `<input /><aside data-sidebar-navigation>
    <button data-sidebar-navigation-item aria-current="page">First</button>
    <button data-sidebar-navigation-item>Second</button>
  </aside>`;
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  root = createRoot(document.createElement("div"));
  await act(() => root.render(createElement(KeyboardProvider, null)));
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function press(init: KeyboardEventInit, target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { metaKey: true, shiftKey: true, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("global navigation shortcut routing", () => {
  it("switches tabs from an editor and consumes the shortcut before other listeners", async () => {
    const input = document.querySelector("input")!;
    const otherListener = vi.fn();
    window.addEventListener("keydown", otherListener);
    try {
      await act(() => {
        const event = press({ key: "@", code: "Digit2" }, input);
        expect(event.defaultPrevented).toBe(true);
      });
      expect(state.activate).toHaveBeenCalledExactlyOnceWith("two");
      expect(otherListener).not.toHaveBeenCalled();
    } finally { window.removeEventListener("keydown", otherListener); }
  });

  it("preserves arrow selection inside text fields", async () => {
    const input = document.querySelector("input")!;
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      await act(() => { expect(press({ key }, input).defaultPrevented).toBe(false); });
    }
    expect(state.activate).not.toHaveBeenCalled();
  });

  it("activates sidebar options with plain clicks and routes horizontal arrows to tabs", async () => {
    const second = document.querySelectorAll("button")[1];
    const click = vi.fn();
    second.addEventListener("click", click);
    await act(() => { expect(press({ key: "ArrowDown" }).defaultPrevented).toBe(true); });
    expect(document.activeElement).toBe(second);
    expect(click).toHaveBeenCalledOnce();
    await act(() => { press({ key: "ArrowRight" }); });
    expect(state.activate).toHaveBeenCalledWith("two");
  });

  it("leaves dialogs, repeats, composition and unavailable tab indices alone", async () => {
    state.dialog = true;
    for (const key of ["ArrowRight", "ArrowDown", "2"]) {
      await act(() => { expect(press({ key, code: key === "2" ? "Digit2" : "" }).defaultPrevented).toBe(false); });
    }
    state.dialog = false;
    for (const extra of [{ repeat: true }, { isComposing: true }, { code: "Digit0", key: "0" }]) {
      await act(() => { press({ key: "@", code: "Digit2", ...extra }); });
    }
    expect(state.activate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });
});
