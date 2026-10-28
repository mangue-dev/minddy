// @vitest-environment jsdom
//
// The LaTeX editor of an equation: what it saves, and what it removes.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import { MathEditMenu } from "./math-edit-menu";

const translate = vi.hoisted(() => (key: string) => key);
vi.mock("next-intl", () => ({ useTranslations: () => translate }));

let root: Root;
let host: HTMLElement;
let editor: Editor;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  editor?.destroy();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function mount(content: string) {
  editor = new Editor({
    element: document.body.appendChild(document.createElement("div")),
    content,
    extensions: pageExtensions(),
  });
  await act(async () => {
    root.render(createElement(MathEditMenu, { editor }));
  });
}

async function open(pos: number) {
  await act(async () => {
    editor.storage.blockMath.edit?.(pos);
  });
  const field = document.querySelector("textarea");
  if (!field) throw new Error("the LaTeX editor did not open");
  return field;
}

async function type(field: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit(field: HTMLTextAreaElement) {
  await act(async () => {
    field.form?.requestSubmit();
  });
}

const latexes = (name: string) => {
  const found: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === name) found.push(String(node.attrs.latex));
  });
  return found;
};

it("edits the LaTeX of a block equation, with its preview", async () => {
  await mount("$$\nx\n$$");
  const field = await open(0);
  expect(field.value).toBe("x");
  await type(field, "  \\frac{a}{b}  ");
  expect(document.querySelector(".page-math-preview .katex")).not.toBeNull();
  await submit(field);
  expect(latexes("blockMath")).toEqual(["\\frac{a}{b}"]);
  expect(document.querySelector("textarea")).toBeNull();
});

it("says when the LaTeX cannot be rendered", async () => {
  await mount("Text $y$ here");
  const field = await open(6);
  await type(field, "\\frac{");
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("mathError");
  expect(field.getAttribute("aria-invalid")).toBe("true");
});

it("removes an equation saved empty", async () => {
  await mount("Text $y$ here");
  const field = await open(6);
  await type(field, "   ");
  await submit(field);
  expect(latexes("inlineMath")).toEqual([]);
  expect(editor.getText()).toBe("Text  here");
});

it("removes a new, never written equation when it is dismissed, and keeps a written one", async () => {
  await mount("$$\nz\n$$");
  editor.commands.insertContentAt(0, { type: "blockMath", attrs: { latex: "" } });
  const field = await open(0);
  await type(field, "abandoned");
  await act(async () => {
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(document.querySelector("textarea")).toBeNull();
  expect(latexes("blockMath")).toEqual(["z"]);
});
