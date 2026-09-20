// @vitest-environment jsdom

import { Activity, act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useIssuePanelTab } from "./use-issue-panel-tab";

afterEach(() => vi.unstubAllGlobals());
it("keeps the chosen issue tab through suspension but honors new opener requests", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let current: ReturnType<typeof useIssuePanelTab>;
  function Panel({ id, requested }: { id: string; requested: "description" | "plan" }) {
    current = useIssuePanelTab(id, requested);
    return createElement("div", null, current[0]);
  }
  const root = createRoot(document.createElement("div"));
  const render = (mode: "visible" | "hidden", id = "first", requested: "description" | "plan" = "description") =>
    root.render(createElement(Activity, { mode, children: createElement(Panel, { id, requested }) }));
  try {
    await act(() => render("visible"));
    await act(() => current[1]("plan"));
    expect(current![0]).toBe("plan");
    await act(() => render("hidden"));
    await act(() => render("visible"));
    expect(current![0]).toBe("plan");
    await act(() => render("visible", "second"));
    expect(current![0]).toBe("description");
    await act(() => render("visible", "second", "plan"));
    expect(current![0]).toBe("plan");
  } finally { await act(() => root.unmount()); }
});
