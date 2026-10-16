// @vitest-environment jsdom
import React, { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import UniqueID from "@tiptap/extension-unique-id";
import { blockExtensions } from "@/components/pages/blocks";
import { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks/types";
import { readHeadings } from "@/lib/pages-toc";
import { PageToc } from "./page-toc";

const h = vi.hoisted(() => ({ renders: 0, reveal: vi.fn(() => () => {}) }));
vi.mock("next-intl", () => ({
  useTranslations: () => {
    h.renders++;
    return (key: string) => key;
  },
}));
vi.mock("@/components/pages/block-actions", () => ({ revealBlock: h.reveal }));
vi.mock("mangue-ui", () => ({ cn: (...names: unknown[]) => names.filter(Boolean).join(" ") }));
vi.mock("@/components/ui/app-tooltip", () => ({
  AppTooltip: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("ignores keystrokes above the headings and still scrolls to their current position", async () => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const editor = new Editor({
    element: document.createElement("div"),
    content: "<p>Intro</p><h2>One</h2><p>Body</p><h2>Two</h2><h2>Three</h2>",
    extensions: [
      Document, Text, ...blockExtensions({ headless: true }),
      UniqueID.configure({ attributeName: BLOCK_ID_ATTRIBUTE, types: ["heading"] }),
    ] as never,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  let scroller: HTMLElement | null = null;
  function Page({ tick }: { tick: number }) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    return <div data-tick={tick}>
      <PageToc editor={editor} scrollRef={scrollRef} />
      <div ref={(el) => { scrollRef.current = el; scroller = el; }} />
    </div>;
  }
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  try {
    await act(() => root.render(<Page tick={0} />));
    await act(() => root.render(<Page tick={1} />));
    expect(container.querySelectorAll("nav button")).toHaveLength(3);
    const settled = h.renders;
    const measured = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");

    await act(async () => { editor.commands.insertContentAt(2, "Longer "); });
    await act(() => root.render(<Page tick={2} />));
    expect(h.renders).toBe(settled);
    expect(measured).not.toHaveBeenCalled();

    const buttons = container.querySelectorAll<HTMLButtonElement>("nav button");
    await act(async () => { buttons[2].click(); });
    const third = readHeadings(editor.state.doc)[2];
    expect(h.reveal).toHaveBeenCalledWith(editor, scroller, third.pos, 24);

    await act(async () => { editor.commands.insertContentAt(third.pos + 1, "Part "); });
    expect(h.renders).toBeGreaterThan(settled);
    expect(container.querySelectorAll("nav button")[2].textContent).toBe("Part Three");
  } finally {
    await act(() => root.unmount());
    container.remove();
    editor.destroy();
  }
});
