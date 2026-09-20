// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  PAGE_NAVIGATION_FRESH_MS,
  preparePageNavigation,
  usePageSurfaceReady,
} from "./use-pages-query";

afterEach(() => vi.restoreAllMocks());

describe("prepared page surface", () => {
  it("keeps the editor mounted when a menu opens after navigation freshness expires", () => {
    const initialTime = 10_000_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(initialTime);
    preparePageNavigation("prepared-page", initialTime);
    const mounted = vi.fn();
    const unmounted = vi.fn();
    function Document() {
      useEffect(() => {
        mounted();
        return unmounted;
      }, []);
      return createElement("div", { contentEditable: true, suppressContentEditableWarning: true }, "Unsaved document");
    }
    function Surface({ menuOpen = false }: { menuOpen?: boolean }) {
      const ready = usePageSurfaceReady("prepared-page", initialTime, false);
      return createElement("section", { "data-menu-open": menuOpen },
        ready ? createElement(Document) : "Loading");
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      flushSync(() => root.render(createElement(Surface)));
      const editor = host.querySelector("[contenteditable]");
      expect(mounted).toHaveBeenCalledTimes(1);
      now.mockReturnValue(initialTime + PAGE_NAVIGATION_FRESH_MS + 1);
      flushSync(() => root.render(createElement(Surface, { menuOpen: true })));
      expect(host.querySelector("[contenteditable]")).toBe(editor);
      expect(host.textContent).toBe("Unsaved document");
      expect(unmounted).not.toHaveBeenCalled();
    } finally {
      flushSync(() => root.unmount());
    }
  });

  it("still requires a fresh server response on a later mount with expired data", () => {
    const initialTime = 20_000_000;
    preparePageNavigation("expired-page", initialTime);
    vi.spyOn(Date, "now").mockReturnValue(initialTime + PAGE_NAVIGATION_FRESH_MS + 1);
    function Surface({ fetched }: { fetched: boolean }) {
      const ready = usePageSurfaceReady("expired-page", initialTime, fetched);
      return createElement("div", null, ready ? "Document" : "Loading");
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      flushSync(() => root.render(createElement(Surface, { fetched: false })));
      expect(host.textContent).toBe("Loading");
      flushSync(() => root.render(createElement(Surface, { fetched: true })));
      expect(host.textContent).toBe("Document");
    } finally {
      flushSync(() => root.unmount());
    }
  });
});
