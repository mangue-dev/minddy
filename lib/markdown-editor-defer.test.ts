// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeferredMarkdownEditor } from "../components/markdown-editor-lazy";

vi.mock("@/components/markdown-editor", () => ({
  MarkdownEditor: (props: { value: string }) =>
    createElement("div", { "data-testid": "rich-editor" }, props.value),
}));
vi.mock("mangue-ui", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

type Frame = { id: number; callback: () => void };
let frames: Frame[] = [];
let nextFrameId = 1;

function flushFrames(count: number) {
  for (let i = 0; i < count; i++) {
    const pending = frames;
    frames = [];
    for (const frame of pending) frame.callback();
  }
}

describe("DeferredMarkdownEditor", () => {
  let host: HTMLElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      const id = nextFrameId++;
      frames.push({ id, callback });
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames = frames.filter((frame) => frame.id !== id);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    frames = [];
  });

  it("mirrors the committed text first, then swaps in the rich editor", async () => {
    await act(async () => {
      root.render(
        createElement(DeferredMarkdownEditor, {
          value: "hello plan",
          onCommit: () => {},
        }),
      );
    });
    expect(host.textContent).toContain("hello plan");
    expect(host.querySelector('[data-testid="rich-editor"]')).toBeNull();

    await act(async () => {
      flushFrames(2);
    });
    const editor = host.querySelector('[data-testid="rich-editor"]');
    expect(editor?.textContent).toBe("hello plan");
  });

  it("does not mount the editor when unmounted before the frames elapse", async () => {
    await act(async () => {
      root.render(
        createElement(DeferredMarkdownEditor, {
          value: "draft",
          onCommit: () => {},
        }),
      );
    });
    await act(async () => {
      flushFrames(1);
    });
    act(() => root.unmount());
    await act(async () => {
      flushFrames(2);
    });
    expect(host.querySelector('[data-testid="rich-editor"]')).toBeNull();
  });
});
