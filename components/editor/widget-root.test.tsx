// @vitest-environment jsdom
//
// ProseMirror builds widgets during view updates, which can run inside a React
// render. The widget's React root must wait for a microtask (MIN-981).
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountWidgetRoot } from "./widget-root";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => { await Promise.resolve(); });

afterEach(() => vi.restoreAllMocks());

describe("mountWidgetRoot", () => {
  it("renders after the current task, not synchronously", async () => {
    const host = document.createElement("span");
    const teardown = mountWidgetRoot(host, <b>logo</b>);
    expect(host.innerHTML).toBe("");
    await flush();
    expect(host.innerHTML).toBe("<b>logo</b>");
    teardown();
    await flush();
    expect(host.innerHTML).toBe("");
  });

  it("never renders a widget dropped before its first render", async () => {
    const host = document.createElement("span");
    const teardown = mountWidgetRoot(host, <b>logo</b>);
    teardown();
    await flush();
    expect(host.innerHTML).toBe("");
  });

  it("does not warn when the widget is built during a React render", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createRoot } = await import("react-dom/client");
    const widget = document.createElement("span");
    function Editor() {
      // What a decoration factory does while the editor renders.
      mountWidgetRoot(widget, <i>icon</i>);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Editor />));
    await flush();
    expect(widget.innerHTML).toBe("<i>icon</i>");
    expect(error).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
