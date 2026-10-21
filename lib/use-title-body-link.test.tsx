// @vitest-environment jsdom
//
// A title and the description under it read as one text on the keyboard
// (MIN-756): Enter and ↓ go down into the description, the account's send
// shortcut creates, and the description gives the caret back to the title.
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { SendModeProvider } from "@/lib/keyboard/use-send-mode";
import type { SendMode } from "@/lib/keyboard/send-shortcut";
import { useTitleBodyLink } from "./use-title-body-link";

let root: Root;
let editor: Editor;
let link: ReturnType<typeof useTitleBodyLink>;
const submit = vi.fn();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom lays nothing out; tiptap's scroll into view still measures ranges.
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  submit.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function Form() {
  link = useTitleBodyLink();
  return createElement(
    "div",
    null,
    createElement("textarea", {
      ref: link.titleRef,
      defaultValue: "Title",
      onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) =>
        link.onTitleKeyDown(e, { submit }),
    }),
    createElement("div", { ref: link.bodyRef })
  );
}

async function mount({ mode = "mod-enter", editable = true }: { mode?: SendMode; editable?: boolean } = {}) {
  const host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  const tree: ReactNode = createElement(SendModeProvider, { mode, children: createElement(Form) });
  await act(async () => root.render(tree));
  const element = document.createElement("div");
  link.bodyRef.current!.append(element);
  editor = new Editor({ element, extensions: [StarterKit], content: "<p>Body</p>", editable });
  const title = link.titleRef.current!;
  title.focus();
  title.setSelectionRange(title.value.length, title.value.length);
  return title;
}

function press(target: HTMLElement, key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

it("jumps to the description's first line on Enter when the account sends with ⌘/Ctrl + Enter", async () => {
  const title = await mount();
  expect(press(title, "Enter").defaultPrevented).toBe(true);
  expect(submit).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(editor.view.dom);
  expect(editor.state.selection.from).toBe(1);
});

it("creates on Enter when the account sends with Enter, and still jumps on Shift + Enter", async () => {
  const title = await mount({ mode: "enter" });
  press(title, "Enter", { shiftKey: true });
  expect(submit).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(editor.view.dom);

  title.focus();
  press(title, "Enter");
  expect(submit).toHaveBeenCalledOnce();
});

it("creates on ⌘/Ctrl + Enter", async () => {
  const title = await mount();
  press(title, "Enter", { metaKey: true });
  expect(submit).toHaveBeenCalledOnce();
});

it("goes down into the description on ↓ from the end of the title", async () => {
  const title = await mount();
  expect(press(title, "ArrowDown").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(editor.view.dom);
});

it("leaves Enter and ↓ to an IME while it composes (MIN-706)", async () => {
  const title = await mount({ mode: "enter" });
  expect(press(title, "Enter", { isComposing: true }).defaultPrevented).toBe(false);
  expect(press(title, "ArrowDown", { isComposing: true }).defaultPrevented).toBe(false);
  expect(press(title, "Enter", { keyCode: 229 }).defaultPrevented).toBe(false);
  expect(submit).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(title);
});

it("leaves ↓ to the field when the description is read-only", async () => {
  const title = await mount({ editable: false });
  expect(press(title, "ArrowDown").defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(title);
});

it("gives the caret back to the end of the title", async () => {
  const title = await mount();
  title.setSelectionRange(0, 0);
  editor.commands.focus("end");
  act(() => link.leaveBody());
  expect(document.activeElement).toBe(title);
  expect(title.selectionStart).toBe(title.value.length);
});
