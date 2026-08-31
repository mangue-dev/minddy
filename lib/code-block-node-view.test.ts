// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { EditorContent } from "@tiptap/react";
import { CODE_LANGUAGE_OPTIONS } from "@/components/code-block-language-catalog";
import { codeBlockEditorExtension } from "@/components/code-block-node-view";
import { blockExtensions } from "@/components/pages/blocks";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      codeLanguage: "Code language",
      codeLanguageEmpty: "No languages found",
      codeLanguageSearch: "Search languages",
      codePlainText: "Plain text",
      codeWrap: "Wrap long lines",
      collapse: "Collapse",
      copied: "Copied",
      copy: "Copy",
      expand: "Expand",
    })[key] ?? key,
}));

vi.mock("mangue-ui", async () => {
  const { createElement, forwardRef } = await import("react");
  const Control = forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }
  >(function Control({ children, size: _size, variant: _variant, ...props }, ref) {
    return createElement("button", { ...props, ref }, children);
  });
  return {
    Button: Control,
    IconButton: Control,
    cn: (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(" "),
  };
});

vi.mock("@/components/search-select", () => ({
  SearchSelect: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));

vi.mock("@/components/ui/tooltip", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    Tooltip: ({ children }: { children: React.ReactNode }) =>
      createElement(Fragment, null, children),
    TooltipContent: ({ children }: { children: React.ReactNode }) =>
      createElement("span", null, children),
    TooltipTrigger: ({ children }: { children: React.ReactNode }) =>
      createElement(Fragment, null, children),
  };
});

afterEach(() => vi.unstubAllGlobals());

function makeEditor(editable = false) {
  return new Editor({
    element: document.createElement("div"),
    editable,
    content: {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const answer = 42" }],
        },
      ],
    },
    extensions: [Document, Text, ...blockExtensions()] as never,
  });
}

function makeLiveEditor() {
  const editor = new Editor({
    editable: true,
    content: {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const answer = 42" }],
        },
      ],
    },
    extensions: [Document, Text, codeBlockEditorExtension()] as never,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(createElement(EditorContent, { editor })));
  return {
    editor,
    destroy: () => {
      flushSync(() => root.unmount());
      editor.destroy();
      host.remove();
    },
  };
}

describe("TipTap code block node view", () => {
  it("offers a broad searchable language catalog", () => {
    expect(CODE_LANGUAGE_OPTIONS.length).toBeGreaterThan(180);
    expect(CODE_LANGUAGE_OPTIONS.map((option) => option.value)).toEqual(
      expect.arrayContaining(["javascript", "typescript", "python", "rust"]),
    );
  });

  it("renders syntax decorations and a working copy button on pages", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const editor = makeEditor();
    const button = editor.view.dom.querySelector<HTMLButtonElement>(
      ".code-block-node-copy",
    );

    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Copy");
    expect(button?.textContent).toBe("");
    expect(button?.querySelector("svg")).not.toBeNull();
    expect(editor.view.dom.querySelector(".hljs-keyword")).not.toBeNull();

    button?.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("const answer = 42"));

    editor.destroy();
  });

  it("persists a language edited in the block header", () => {
    const editor = makeEditor(true);
    const language = editor.view.dom.querySelector<HTMLInputElement>(
      ".code-block-node-language",
    );

    expect(language?.value).toBe("typescript");
    if (!language) throw new Error("The code language input was not rendered");

    language.value = "javascript";
    language.dispatchEvent(new Event("input", { bubbles: true }));

    expect(editor.getJSON().content?.[0]?.attrs?.language).toBe("javascript");
    editor.destroy();
  });

  it("renders compact live controls without a leading code icon", async () => {
    const live = makeLiveEditor();
    const { editor } = live;

    await vi.waitFor(() =>
      expect(editor.view.dom.querySelector(".code-block-node-language-trigger")).not.toBeNull(),
    );
    const trigger = editor.view.dom.querySelector(".code-block-node-language-trigger");
    const wrap = editor.view.dom.querySelector<HTMLButtonElement>(".code-block-node-wrap");
    expect(trigger?.textContent).toContain("TypeScript");
    expect(trigger?.querySelector(".lucide-code-2")).toBeNull();
    expect(trigger?.querySelector(".lucide-chevrons-up-down")).not.toBeNull();
    expect(wrap?.getAttribute("aria-pressed")).toBe("true");

    wrap?.click();
    await vi.waitFor(() => expect(wrap?.getAttribute("aria-pressed")).toBe("false"));

    live.destroy();
  });

  it("offers expansion only when the live code body exceeds the height cap", async () => {
    let notifyResize = () => {};
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this as unknown as ResizeObserver);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);

    const live = makeLiveEditor();
    const { editor } = live;
    let pre: Element | null = null;
    await vi.waitFor(() => {
      pre = editor.view.dom.querySelector(".code-block-node-view > pre");
      expect(pre).not.toBeNull();
    });
    Object.defineProperty(pre, "scrollHeight", { configurable: true, value: 461 });
    notifyResize();

    await vi.waitFor(() =>
      expect(editor.view.dom.querySelector(".code-block-node-expand")).not.toBeNull(),
    );
    const view = editor.view.dom.querySelector(".code-block-node-view");
    const button = editor.view.dom.querySelector<HTMLButtonElement>(
      ".code-block-node-expand button",
    );
    expect(view?.getAttribute("data-expanded")).toBe("false");
    expect(button?.textContent).toContain("Expand");

    button?.click();
    await vi.waitFor(() => expect(view?.getAttribute("data-expanded")).toBe("true"));
    expect(button?.textContent).toContain("Collapse");

    live.destroy();
  });
});
