// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "@tiptap/pm/view";

import { revealSelection } from "./mobile-editor-toolbar";

// MIN-870: typing at the foot of the notebook scrolled the text twice, both
// times instantly. One smooth scroll now keeps the caret above the strip.
const LAYOUT_HEIGHT = 714;
const KEYBOARD = 330;

let container: HTMLElement;
let caretBottom: number;

function view(): EditorView {
  const dom = document.createElement("div");
  container.append(dom);
  return {
    dom,
    state: { selection: { head: 1 } },
    coordsAtPos: () => ({ top: caretBottom - 20, bottom: caretBottom, left: 0, right: 0 }),
  } as unknown as EditorView;
}

beforeEach(() => {
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: LAYOUT_HEIGHT });
  document.documentElement.style.setProperty("--mobile-keyboard-inset", `${KEYBOARD}px`);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  container = document.createElement("div");
  container.style.overflowY = "auto";
  Object.defineProperty(container, "scrollHeight", { configurable: true, value: 2000 });
  Object.defineProperty(container, "clientHeight", { configurable: true, value: 600 });
  container.scrollTop = 100;
  container.scrollTo = vi.fn() as unknown as typeof container.scrollTo;
  document.body.append(container);
});

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.style.removeProperty("--mobile-keyboard-inset");
  vi.unstubAllGlobals();
});

describe("revealSelection", () => {
  it("scrolls a caret hidden by the keyboard smoothly above the strip", () => {
    caretBottom = 500;
    revealSelection(view());
    // Visible band ends at 714 - 330 = 384; strip reserve 60 and caret room 48.
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 100 + (500 - (384 - 60 - 48)), behavior: "smooth" });
  });

  it("aims at the same place when called again mid-scroll", () => {
    caretBottom = 500;
    const editorView = view();
    revealSelection(editorView);
    const [first] = vi.mocked(container.scrollTo).mock.calls[0] as unknown as [ScrollToOptions];
    // Halfway through the smooth scroll, the caret has moved up as much.
    container.scrollTop += 100;
    caretBottom -= 100;
    revealSelection(editorView);
    const [second] = vi.mocked(container.scrollTo).mock.calls[1] as unknown as [ScrollToOptions];
    expect(second.top).toBe(first.top);
  });

  it("leaves a visible caret where it is", () => {
    caretBottom = 200;
    revealSelection(view());
    expect(container.scrollTo).not.toHaveBeenCalled();
  });
});
