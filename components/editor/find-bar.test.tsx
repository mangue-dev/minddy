// @vitest-environment jsdom
//
// The bar against a real editor: ⌘F opens it, typing highlights and counts,
// Enter moves, Replace all edits the document in one transaction, and
// Escape closes it without reaching the dialog underneath.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import type { Editor as ReactEditor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FindBar } from "./find-bar";
import { FindReplace } from "./find-replace";
import { resolveKeyToken } from "@/lib/keyboard/shortcuts";

const translate = vi.hoisted(() => (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key);
vi.mock("next-intl", () => ({ useTranslations: () => translate }));
// jsdom lays nothing out, so no element is ever "visible": the scope rule
// has its own tests (lib/keyboard/find-shortcut.test.ts).
const owns = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/keyboard/find-shortcut", async () => {
  const real = await vi.importActual<typeof import("@/lib/keyboard/find-shortcut")>("@/lib/keyboard/find-shortcut");
  return { ...real, surfaceOwnsScreen: () => owns.value };
});

let root: Root;
let host: HTMLElement;
let editor: Editor;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  // jsdom has no layout: every match reads as off screen and gets revealed.
  vi.stubGlobal("scrollBy", vi.fn());
  owns.value = true;
  host = document.body.appendChild(document.createElement("div"));
  const mountPoint = document.body.appendChild(document.createElement("div"));
  editor = new Editor({
    element: mountPoint,
    extensions: [Document, Paragraph, Text, FindReplace],
    content: "<p>alpha beta alpha</p><p>Alpha gamma</p>",
  });
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  editor.destroy();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function render(editable = true) {
  await act(async () => {
    root.render(createElement(FindBar, { editor: editor as unknown as ReactEditor, editable }));
  });
}

async function pressFind() {
  // The platform decides the modifier: ⌘ on a Mac, Ctrl elsewhere.
  const mac = resolveKeyToken("mod") === "⌘";
  const event = new KeyboardEvent("keydown", { key: "f", metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true });
  await act(async () => {
    window.dispatchEvent(event);
  });
  return event;
}

// The bar is portaled out of the editor's container (to the body here).
const field = () => document.body.querySelector<HTMLInputElement>('input[aria-label="findPlaceholder"]')!;

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const selected = () => editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);

it("opens on the find shortcut only when the document owns the screen", async () => {
  await render();
  owns.value = false;
  const ignored = await pressFind();
  expect(ignored.defaultPrevented).toBe(false);
  expect(document.body.querySelector('[role="search"]')).toBeNull();

  owns.value = true;
  const taken = await pressFind();
  expect(taken.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(field());
});

it("highlights and counts matches, and steps through them", async () => {
  await render();
  await pressFind();
  await type(field(), "alpha");

  expect(editor.view.dom.querySelectorAll(".ProseMirror-search-match, .ProseMirror-active-search-match")).toHaveLength(3);
  expect(editor.view.dom.querySelectorAll(".ProseMirror-active-search-match")).toHaveLength(1);
  expect(document.body.textContent).toContain('findCount:{"current":1,"total":3}');

  await act(async () => {
    field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(document.body.textContent).toContain('findCount:{"current":2,"total":3}');

  await act(async () => {
    document.body.querySelector<HTMLButtonElement>('button[aria-label="findMatchCase"]')!.click();
  });
  expect(document.body.textContent).toContain('findCount:{"current":1,"total":2}');
  expect(selected()).toBe("alpha");
});

it("shows an invalid expression and highlights nothing", async () => {
  await render();
  await pressFind();
  await act(async () => {
    document.body.querySelector<HTMLButtonElement>('button[aria-label="findRegex"]')!.click();
  });
  await type(field(), "(alpha");
  expect(field().getAttribute("aria-invalid")).toBe("true");
  expect(document.body.textContent).toContain("findInvalidRegex");
  expect(editor.view.dom.querySelectorAll(".ProseMirror-search-match")).toHaveLength(0);
});

it("replaces every match with regular-expression groups in one transaction", async () => {
  await render();
  await pressFind();
  await act(async () => {
    document.body.querySelector<HTMLButtonElement>('button[aria-label="findRegex"]')!.click();
    document.body.querySelector<HTMLButtonElement>('button[aria-label="findShowReplace"]')!.click();
  });
  await type(field(), "(a)lpha");
  await type(document.body.querySelector<HTMLInputElement>('input[aria-label="findReplacePlaceholder"]')!, "$1-");
  const steps = vi.fn();
  editor.on("update", steps);
  await act(async () => {
    document.body.querySelector<HTMLButtonElement>('button[aria-label="findReplaceAll"]')!.click();
  });
  // Case-insensitive by default: “Alpha” keeps its own capital through `$1`.
  expect(editor.getText({ blockSeparator: "|" })).toBe("a- beta a-|A- gamma");
  expect(steps).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain('findReplaced:{"count":3}');
});

it("offers no replace on a read-only document", async () => {
  await render(false);
  await pressFind();
  expect(document.body.querySelector('button[aria-label="findShowReplace"]')).toBeNull();
});

it("closes on Escape before a dialog underneath sees it, and clears the highlights", async () => {
  await render();
  await pressFind();
  await type(field(), "beta");
  const underneath = vi.fn();
  document.addEventListener("keydown", underneath, true);
  await act(async () => {
    field().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  document.removeEventListener("keydown", underneath, true);
  expect(underneath).not.toHaveBeenCalled();
  expect(document.body.querySelector('[role="search"]')).toBeNull();
  expect(editor.view.dom.querySelectorAll(".ProseMirror-search-match, .ProseMirror-active-search-match")).toHaveLength(0);
  expect(selected()).toBe("beta");
});
