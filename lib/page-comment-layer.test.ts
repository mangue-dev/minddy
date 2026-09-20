// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Editor } from "@tiptap/core";
import { PageCommentLayer } from "@/components/pages/page-comment-layer";

const fixture = vi.hoisted(() => ({
  ids: ["block-1", "block-2"],
  rendered: [] as ReadonlySet<string>[],
  threads: [],
  translate: (key: string) => key,
}));
vi.mock("next-intl", () => ({ useTranslations: () => fixture.translate }));
vi.mock("@/components/pages/page-comment-popover", () => ({ PageCommentPopover: () => null }));
vi.mock("@/components/pages/block-comments", () => ({
  documentBlockIds: () => new Set(fixture.ids),
  setCommentedBlocks: vi.fn(),
}));
vi.mock("@/lib/use-page-comments", () => ({
  usePageComments: ({ blockIds }: { blockIds: ReadonlySet<string> }) => {
    fixture.rendered.push(blockIds);
    return { threads: fixture.threads };
  },
}));

describe("page comment block subscriptions", () => {
  it("keeps thread inputs stable when typing, but updates on block deletion and undo", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const updates = new Set<() => void>();
    // This fixture supplies the editor members consumed by PageCommentLayer;
    // document traversal is controlled separately to simulate edit transactions.
    const editor = {
      isDestroyed: false,
      storage: {},
      on: (_event: string, callback: () => void) => updates.add(callback),
      off: (_event: string, callback: () => void) => updates.delete(callback),
    } as unknown as Editor;
    const host = document.createElement("div");
    const root = createRoot(host);
    const update = () => act(() => { for (const callback of updates) callback(); });
    try {
      await act(() => root.render(createElement(PageCommentLayer, {
        projectId: "project-1",
        pageId: "page-1",
        editor,
        members: [],
        currentUserId: null,
        draftAnchor: null,
        onDraftAnchorDone: () => {},
      })));
      const initial = fixture.rendered.at(-1);
      expect([...initial!]).toEqual(["block-1", "block-2"]);
      fixture.rendered.length = 0;
      for (let index = 0; index < 100; index += 1) await update();
      expect(fixture.rendered.every((ids) => ids === initial)).toBe(true);
      expect(fixture.rendered.length).toBeLessThanOrEqual(1);

      fixture.ids = ["block-1"];
      await update();
      expect([...fixture.rendered.at(-1)!]).toEqual(["block-1"]);
      fixture.ids = ["block-1", "block-2"];
      await update();
      expect([...fixture.rendered.at(-1)!]).toEqual(["block-1", "block-2"]);
    } finally {
      await act(() => root.unmount());
      vi.unstubAllGlobals();
    }
    expect(updates.size).toBe(0);
  });
});
