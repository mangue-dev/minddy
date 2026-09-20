// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useAutosize } from "./use-autosize";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function Field({ value }: { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosize(ref, value);
  return createElement("textarea", { ref, value, readOnly: true });
}
describe("textarea sizing", () => {
  it("leaves layout to native field sizing without reading geometry on input", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const geometry = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get");
    const host = document.createElement("div"); const root = createRoot(host);
    try {
      flushSync(() => root.render(createElement(Field, {value: "Title"})));
      const field = host.querySelector("textarea");
      flushSync(() => root.render(createElement(Field, {value: "A much longer title\nwith two lines"})));
      expect(host.querySelector("textarea")).toBe(field);
      expect(field?.style.height).toBe("");
      expect(geometry).not.toHaveBeenCalled();
    } finally { flushSync(() => root.unmount()); }
  });
  it("still grows and shrinks in browsers without native field sizing", () => {
    vi.stubGlobal("CSS", { supports: () => false });
    const geometry = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(24);
    const host = document.createElement("div"); const root = createRoot(host);
    try {
      flushSync(() => root.render(createElement(Field, {value: "Title"})));
      const field = host.querySelector("textarea");
      expect(field?.style.height).toBe("24px");
      geometry.mockReturnValue(96);
      flushSync(() => root.render(createElement(Field, {value: "A longer title"})));
      expect(field?.style.height).toBe("96px");
      geometry.mockReturnValue(24);
      flushSync(() => root.render(createElement(Field, {value: ""})));
      expect(field?.style.height).toBe("24px");
    } finally { flushSync(() => root.unmount()); }
  });
});
