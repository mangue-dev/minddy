// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Activity, act, createElement } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { actionMenuItems, hasVisibleOpenDialog, isVisibleOverlay } from "./visible-overlays";
import { keepOverlayOpenForPopper } from "./overlay-dismiss";

// jsdom has no layout; provide the browser visibility primitive against actual
// DOM styles, including React Activity's hidden portaled host nodes.
const originalVisibility = Object.getOwnPropertyDescriptor(Element.prototype, "checkVisibility");
function installVisibility() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(Element.prototype, "checkVisibility", { configurable: true, value: function (this: Element) {
    const ownStyle = getComputedStyle(this);
    if (ownStyle.display === "none" || ownStyle.visibility === "hidden") return false;
    let ancestor = this.parentElement;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility === "hidden") return false;
      ancestor = ancestor.parentElement;
    }
    return this.isConnected;
  } });
}
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalVisibility) Object.defineProperty(Element.prototype, "checkVisibility", originalVisibility);
  else Reflect.deleteProperty(Element.prototype, "checkVisibility");
});

describe("retained overlay ownership", () => {
  it("ignores an open dialog portal hidden by Activity while recognizing the active dialog", async () => {
    installVisibility();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const portal = createPortal(createElement("div", { role: "dialog", "data-state": "open", "data-old": true }), document.body);
    try {
      await act(() => root.render(createElement(Activity, { mode: "visible", children: portal })));
      expect(hasVisibleOpenDialog()).toBe(true);
      await act(() => root.render(createElement(Activity, { mode: "hidden", children: portal })));
      const hidden = document.querySelector("[data-old]")!;
      expect(hidden).not.toBeNull();
      expect(hasVisibleOpenDialog()).toBe(false);
      const active = document.createElement("div");
      active.setAttribute("role", "dialog");
      active.setAttribute("data-state", "open");
      document.body.append(active);
      expect(hasVisibleOpenDialog()).toBe(true);
      active.remove();
      await act(() => root.render(createElement(Activity, { mode: "visible", children: portal })));
      expect(hasVisibleOpenDialog()).toBe(true);
    } finally { await act(() => root.unmount()); }
  });

  it("does not let a hidden retained popper prevent dismissal of an unrelated active overlay", () => {
    installVisibility();
    document.body.innerHTML = '<div data-slot="dropdown-menu-content" data-state="open" style="display:none"></div><button id="outside"></button>';
    const outside = document.getElementById("outside")!;
    const originalEvent = new Event("pointerdown");
    Object.defineProperty(originalEvent, "target", { value: outside });
    const preventDefault = vi.fn();
    keepOverlayOpenForPopper({ detail: { originalEvent }, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    (document.querySelector('[data-slot="dropdown-menu-content"]') as HTMLElement).style.display = "block";
    keepOverlayOpenForPopper({ detail: { originalEvent }, preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("scopes menu-search navigation to its own content, excluding hidden and unrelated menu items", () => {
    document.body.innerHTML = '<div data-slot="dropdown-menu-content" style="display:none"><button data-slot="dropdown-menu-item" id="hidden">Hidden</button></div><div data-slot="dropdown-menu-content"><input><button data-slot="dropdown-menu-item" data-disabled id="disabled">Disabled</button><button data-slot="dropdown-menu-item" id="active">Active</button><button data-slot="dropdown-menu-sub-trigger" id="submenu">Submenu</button></div>';
    expect(actionMenuItems(document.querySelector("input")).map((item) => item.id)).toEqual(["active", "submenu"]);
  });

  it("uses a layout fallback for browsers without checkVisibility", () => {
    const element = document.createElement("div");
    document.body.append(element);
    Object.defineProperty(element, "checkVisibility", { value: undefined });
    vi.spyOn(element, "getClientRects").mockReturnValue([{ width: 10, height: 10 }] as unknown as DOMRectList);
    expect(isVisibleOverlay(element)).toBe(true);
    vi.spyOn(element, "getClientRects").mockReturnValue([] as unknown as DOMRectList);
    expect(isVisibleOverlay(element)).toBe(false);
  });
});
