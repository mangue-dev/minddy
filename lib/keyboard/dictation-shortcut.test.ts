// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, createElement } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { DictateButton } from "@/components/ai-elements/dictate-button";

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
// Use the real Radix popover/tooltip primitives, including their portals and refs.
vi.mock("mangue-ui", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("mangue-ui/lib/utils.ts")),
  ...(await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/popover.tsx")),
  ...(await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/tooltip.tsx")),
  ...(await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/spinner.tsx")),
  toast: { error: vi.fn(), info: vi.fn() },
}));

const getUserMedia = vi.fn();
const stop = vi.fn();
class Recorder {
  static isTypeSupported() { return true; }
  state = "inactive";
  mimeType = "audio/webm";
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; stop(); this.onstop?.(); }
}

const originalVisibility = Object.getOwnPropertyDescriptor(Element.prototype, "checkVisibility");
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  // jsdom has no layout. Model visibility through ancestors, as a browser does.
  Object.defineProperty(Element.prototype, "checkVisibility", { configurable: true, value: function (this: Element) {
    const ownStyle = getComputedStyle(this);
    if (ownStyle.display === "none" || ownStyle.visibility === "hidden") return false;
    for (let node = this.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return this.isConnected;
  } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  if (originalVisibility) Object.defineProperty(Element.prototype, "checkVisibility", originalVisibility);
  else Reflect.deleteProperty(Element.prototype, "checkVisibility");
  Reflect.deleteProperty(navigator, "mediaDevices");
});

function mic(name: string, disabled = false, hideWhenIdle = false) {
  return createElement("span", { "data-mic": name }, createElement(DictateButton, {
    context: "issue_form", onTranscription: vi.fn(), shortcutKey: "mod+shift+d",
    tooltipLabel: name, disabled, hideWhenIdle,
  }));
}

function surface(slot: string, child: React.ReactNode, style?: React.CSSProperties, state = "open") {
  // Match the DOM contract of mangue-ui's portaled Dialog/SidePanelContent.
  return createPortal(createElement("div", {
    role: slot === "alert-dialog-content" ? "alertdialog" : "dialog",
    "data-slot": slot, "data-state": state, style: { zIndex: 50, ...style },
  }, child), document.body);
}

async function press(overrides: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "D", metaKey: true, shiftKey: true, bubbles: true, cancelable: true, ...overrides,
  });
  await act(async () => { document.dispatchEvent(event); });
  return event;
}

function recording(name: string) {
  return document.querySelector(`[data-mic="${name}"] button`)?.getAttribute("aria-pressed") === "true";
}

describe("dictation shortcut ownership (MIN-656)", () => {
  it.each(["dialog-content", "side-panel-content"])("starts only the foreground %s above an objective page", async (slot) => {
    await act(() => root.render(createElement(React.Fragment, null,
      createElement("main", null, mic("Objective", false, true)), surface(slot, mic("Foreground")),
    )));
    expect((await press()).defaultPrevented).toBe(true);
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(recording("Objective")).toBe(false);
    expect(recording("Foreground")).toBe(true);
  });

  it.each(["issue", "objective"])("gives the %s creation modal priority over an issue sidebar", async (kind) => {
    await act(() => root.render(createElement(React.Fragment, null,
      surface("side-panel-content", mic("Sidebar")), surface("dialog-content", mic(kind)),
    )));
    await press({ metaKey: false, ctrlKey: true });
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(recording("Sidebar")).toBe(false);
    expect(recording(kind)).toBe(true);
  });

  it("routes to a dialog even when its listener was registered before the page listener", async () => {
    await act(() => root.render(createElement(React.Fragment, null,
      surface("dialog-content", mic("Modal")), createElement("main", null, mic("Page")),
    )));
    await press();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(recording("Page")).toBe(false);
    expect(recording("Modal")).toBe(true);
  });

  it("blocks background dictation when the foremost modal has no microphone or a disabled one", async () => {
    for (const child of [createElement("input"), mic("Disabled", true)]) {
      await act(() => root.render(createElement(React.Fragment, null,
        createElement("main", null, mic("Page")), surface("dialog-content", child),
      )));
      await press();
      expect(getUserMedia).not.toHaveBeenCalled();
    }
  });

  it("honors the foremost stacked modal and resumes the underlying sidebar after dismissal", async () => {
    const sidebar = surface("side-panel-content", mic("Sidebar"));
    const modal = surface("dialog-content", mic("Modal"));
    const confirmation = surface("alert-dialog-content", createElement("button", null, "Confirm"));
    await act(() => root.render(createElement(React.Fragment, null, sidebar, modal, confirmation)));
    await press();
    expect(getUserMedia).not.toHaveBeenCalled();
    await act(() => root.render(sidebar));
    await press();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(recording("Sidebar")).toBe(true);
  });

  it("uses z-index before portal order", async () => {
    await act(() => root.render(createElement(React.Fragment, null,
      surface("dialog-content", mic("Upper"), { zIndex: 100 }),
      surface("side-panel-content", mic("Lower")),
    )));
    await press();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(recording("Lower")).toBe(false);
    expect(recording("Upper")).toBe(true);
  });

  it("ignores hidden retained pages, hidden dialog portals, and closed animation layers", async () => {
    await act(() => root.render(createElement(React.Fragment, null,
      createElement("main", { style: { display: "none" } }, mic("Hidden page")),
      createElement("main", null, mic("Active", false, true)),
      surface("dialog-content", mic("Hidden modal"), { display: "none" }),
      surface("dialog-content", mic("Closing modal"), undefined, "closed"),
    )));
    await press();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(recording("Hidden page")).toBe(false);
    expect(recording("Hidden modal")).toBe(false);
    expect(recording("Closing modal")).toBe(false);
    expect(recording("Active")).toBe(true);
  });

  it.each([false, true])("stops the same recorder through its portaled popover (in modal: %s)", async (inModal) => {
    const child = mic("Active", false, true);
    await act(() => root.render(inModal ? surface("dialog-content", child) : createElement("main", null, child)));
    await press();
    expect(document.querySelector('[data-slot="popover-content"][role="dialog"]')).not.toBeNull();
    await press();
    expect(stop).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  it("claims an event once and suppresses the global creation fallback", async () => {
    await act(() => root.render(createElement("main", null, mic("First"), mic("Second"))));
    const fallback = vi.fn();
    window.addEventListener("keydown", fallback);
    try {
      await press();
      expect(getUserMedia).toHaveBeenCalledOnce();
      expect(fallback).not.toHaveBeenCalled();
    } finally { window.removeEventListener("keydown", fallback); }
  });

  it("leaves handled events, key repeats, and different modifier combinations alone", async () => {
    await act(() => root.render(createElement("main", null, mic("Active"))));
    await press({ repeat: true });
    await press({ shiftKey: false });
    await press({ altKey: true });
    const handled = new KeyboardEvent("keydown", { key: "D", metaKey: true, shiftKey: true, cancelable: true });
    handled.preventDefault();
    await act(() => { document.dispatchEvent(handled); });
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
