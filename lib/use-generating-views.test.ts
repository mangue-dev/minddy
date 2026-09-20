// @vitest-environment jsdom
import { Activity, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGeneratingViews } from "./use-generating-views";

let root: Root;
let container: HTMLDivElement;
let status: ReturnType<typeof useGeneratingViews>;
let views = [{ id: "view", updated_at: "initial" }];
function Status() { status = useGeneratingViews(views, 1000); return createElement("span", null, [...status.generatingViewIds].join(",")); }
const render = async (visible: boolean) => {
  await act(() => root.render(createElement(Activity, { mode: visible ? "visible" : "hidden", children: createElement(Status) })));
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  views = [{ id: "view", updated_at: "initial" }];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("retained view generation deadlines", () => {
  it("pauses hidden timers and restores only the remaining deadline", async () => {
    await render(true);
    await act(() => status.beginGenerating(views[0]));
    await act(() => vi.advanceTimersByTime(300));
    await render(false);
    expect(vi.getTimerCount()).toBe(0);
    await act(() => vi.advanceTimersByTime(400));
    await render(true);
    expect(status.generatingViewIds.has("view")).toBe(true);
    await act(() => vi.advanceTimersByTime(301));
    expect(status.generatingViewIds.size).toBe(0);
  });
  it("settles expired or remotely completed generations when a view becomes visible", async () => {
    await render(true);
    await act(() => status.beginGenerating(views[0]));
    await render(false);
    await act(() => vi.advanceTimersByTime(1001));
    await render(true);
    expect(status.generatingViewIds.size).toBe(0);
    await act(() => status.beginGenerating(views[0]));
    await render(false);
    views = [{ id: "view", updated_at: "completed" }];
    await render(true);
    expect(status.generatingViewIds.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
