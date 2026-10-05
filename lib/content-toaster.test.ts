// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ContentToaster } from "@/components/content-toaster";

let pane: HTMLDivElement;
let main: HTMLElement;
let root: Root;

beforeEach(() => {
  toast.dismiss();
  window.localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 1));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.useFakeTimers();
  pane = document.createElement("div");
  main = document.createElement("main");
  pane.appendChild(main);
  document.body.appendChild(pane);
  root = createRoot(main);
});

afterEach(() => {
  act(() => root.unmount());
  pane.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function render() {
  act(() => root.render(createElement(ContentToaster)));
}

function fire(fn: () => void) {
  act(fn);
  act(() => { vi.advanceTimersByTime(20); });
}

const title = () => pane.querySelector("[data-title]")?.textContent;
const notification = () => pane.querySelector("[data-sonner-toast]");

describe("the content toaster", () => {
  it("anchors a single toast surface to the pane outside the scrolling main", () => {
    render();
    fire(() => toast.success("Copied"));
    const surface = pane.querySelector(".content-toaster");
    expect(surface?.getAttribute("data-x-position")).toBe("center");
    expect(surface?.getAttribute("data-y-position")).toBe("bottom");
    expect(pane.querySelectorAll("[data-sonner-toaster]")).toHaveLength(1);
    expect(main.querySelector("[data-sonner-toaster]")).toBeNull();
    expect(title()).toBe("Copied");
    expect(pane.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it.each(["info", "success", "warning", "error"] as const)("keeps %s feedback typed for its colored badge", (kind) => {
    render();
    fire(() => toast[kind](`${kind} feedback`));
    expect(notification()?.getAttribute("data-type")).toBe(kind);
    expect(title()).toBe(`${kind} feedback`);
  });

  it("keeps bare copy confirmations visible", () => {
    render();
    fire(() => toast("Copied"));
    expect(title()).toBe("Copied");
    expect(notification()?.getAttribute("data-type")).toBeNull();
  });

  it("updates the same toast id without duplicating the message", () => {
    render();
    fire(() => toast.info("Dictating…", { id: "dictation-in-flight" }));
    fire(() => toast.success("Done", { id: "dictation-in-flight" }));
    expect(title()).toBe("Done");
    expect(pane.querySelectorAll("[data-sonner-toast]")).toHaveLength(1);
    expect(pane.textContent).not.toContain("Dictating…");
  });

  it("automatically expires messages and removes them from Sonner's active store", () => {
    render();
    fire(() => toast.success("Saved", { id: "expires" }));
    act(() => { vi.advanceTimersByTime(4_000); });
    act(() => { vi.advanceTimersByTime(250); });
    expect(notification()).toBeNull();
    expect(toast.getToasts().some((entry) => entry.id === "expires")).toBe(false);
  });

  it("honors explicit dismissal", () => {
    render();
    fire(() => toast.info("In flight", { id: "dismissed" }));
    fire(() => toast.dismiss("dismissed"));
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { vi.advanceTimersByTime(250); });
    expect(notification()).toBeNull();
  });

  it("purges legacy error history without restoring or saving errors", () => {
    window.localStorage.setItem("minddy:status-errors", '{"format":"minddy-local-v1","ciphertext":"old"}');
    const save = vi.spyOn(Storage.prototype, "setItem");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render();
    fire(() => toast.error("Failure"));
    expect(window.localStorage.getItem("minddy:status-errors")).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(pane.querySelectorAll("button")).toHaveLength(1); // Only Sonner's dismiss control.
  });
});
