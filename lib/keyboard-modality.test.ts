// @vitest-environment jsdom
//
// MIN-783: keyboard focus is drawn while Tab drives focus (WCAG 2.4.7), and the
// shortcuts that act on "the card under the pointer" also reach the card a
// keyboard user has focused (WCAG 2.1.1).

import { afterEach, describe, expect, it } from "vitest";

import { INPUT_MODALITY_ATTRIBUTE, keyboardAimsLast, trackKeyboardModality } from "@/lib/keyboard-modality";
import { innermostFocused, keyboardAnchorIn } from "@/lib/keyboard/hover-keys";

const root = document.documentElement;
const tab = (init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", ...init }));

afterEach(() => {
  document.body.innerHTML = "";
  root.removeAttribute(INPUT_MODALITY_ATTRIBUTE);
});

describe("trackKeyboardModality", () => {
  it("marks the document on Tab and clears it on the next pointer press", () => {
    const stop = trackKeyboardModality();
    expect(root.hasAttribute(INPUT_MODALITY_ATTRIBUTE)).toBe(false);
    tab({ shiftKey: true });
    expect(root.getAttribute(INPUT_MODALITY_ATTRIBUTE)).toBe("keyboard");
    window.dispatchEvent(new Event("pointerdown"));
    expect(root.hasAttribute(INPUT_MODALITY_ATTRIBUTE)).toBe(false);
    stop();
  });

  it("ignores other keys and Tab chords, which do not move focus in the page", () => {
    const stop = trackKeyboardModality();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    tab({ ctrlKey: true });
    tab({ metaKey: true });
    expect(root.hasAttribute(INPUT_MODALITY_ATTRIBUTE)).toBe(false);
    stop();
  });

  it("hands shortcuts back to the pointer once it moves, keeping the ring", () => {
    const stop = trackKeyboardModality();
    tab();
    expect(keyboardAimsLast()).toBe(true);
    // A scroll under a still mouse reports no movement.
    window.dispatchEvent(Object.assign(new Event("pointermove"), { movementX: 0, movementY: 0 }));
    expect(keyboardAimsLast()).toBe(true);
    window.dispatchEvent(Object.assign(new Event("pointermove"), { movementX: 3, movementY: 0 }));
    expect(keyboardAimsLast()).toBe(false);
    expect(root.getAttribute(INPUT_MODALITY_ATTRIBUTE)).toBe("keyboard");
    stop();
  });

  it("stops listening and clears the mark when stopped", () => {
    const stop = trackKeyboardModality();
    tab();
    stop();
    expect(root.hasAttribute(INPUT_MODALITY_ATTRIBUTE)).toBe(false);
    tab();
    expect(root.hasAttribute(INPUT_MODALITY_ATTRIBUTE)).toBe(false);
  });
});

describe("innermostFocused", () => {
  function board() {
    document.body.innerHTML = `
      <div id="wrapper" tabindex="0"><div id="card"><button id="status">Status</button></div></div>
      <div id="other-wrapper" tabindex="0"><div id="other"></div></div>`;
    const byId = (id: string) => document.getElementById(id)!;
    const registry = new Map<Element, string>([[byId("card"), "card"], [byId("other"), "other"]]);
    return { byId, registry };
  }

  it("targets the card whose drag wrapper holds focus", () => {
    const { byId, registry } = board();
    byId("wrapper").focus();
    expect(innermostFocused(registry)).toBe("card");
  });

  it("targets the card that contains the focused control", () => {
    const { byId, registry } = board();
    byId("status").focus();
    expect(innermostFocused(registry)).toBe("card");
  });

  it("targets nothing when focus rests on the page", () => {
    const { registry } = board();
    expect(innermostFocused(registry, document.body)).toBeUndefined();
    expect(innermostFocused(registry, null)).toBeUndefined();
  });
});

describe("keyboardAnchorIn", () => {
  it("anchors a picker under the focused control when Tab aimed last", () => {
    const stop = trackKeyboardModality();
    document.body.innerHTML = `<div id="wrapper" tabindex="0"><div id="card"></div></div>`;
    const wrapper = document.getElementById("wrapper")!;
    wrapper.getBoundingClientRect = () => ({ left: 40, bottom: 120 }) as DOMRect;
    wrapper.focus();
    const card = document.getElementById("card");
    expect(keyboardAnchorIn(card)).toBeNull();
    tab();
    expect(keyboardAnchorIn(card)).toEqual({ x: 40, y: 120 });
    window.dispatchEvent(new Event("pointerdown"));
    expect(keyboardAnchorIn(card)).toBeNull();
    stop();
  });
});
