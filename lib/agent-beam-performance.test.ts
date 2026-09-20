// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { AgentBeam, AgentBeamOverlay } from "@/components/agent-beam";

vi.mock("mangue-ui", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

const observe = vi.fn();
const disconnect = vi.fn();
const matchMedia = vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", matchMedia);
  vi.stubGlobal("IntersectionObserver", class {
    observe = observe;
    disconnect = disconnect;
  });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("inactive agent beam cost", () => {
  it("mounts 600 idle cards without beam styles or native subscriptions and retains their DOM", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = (active: boolean) => act(() => root.render(createElement("div", null,
      ...Array.from({ length: 600 }, (_, index) => createElement(AgentBeam, {
        key: index,
        active: active && index === 0,
        keepMounted: true,
        className: "rounded-xl",
        children: createElement("input", { defaultValue: `Card ${index}` }),
      })))));
    try {
      await render(false);
      expect(host.querySelectorAll("style")).toHaveLength(0);
      expect(host.querySelectorAll("[data-beam]")).toHaveLength(0);
      expect(observe).not.toHaveBeenCalled();
      expect(matchMedia).not.toHaveBeenCalled();
      const input = host.querySelector("input")!;
      input.value = "Unsaved text";
      input.focus();

      await render(true);
      expect(host.querySelectorAll("style")).toHaveLength(1);
      expect(host.querySelectorAll("[data-beam][data-active]")).toHaveLength(1);
      expect(host.querySelector("input")).toBe(input);
      expect(document.activeElement).toBe(input);

      await render(false);
      const fading = host.querySelector("[data-beam][data-fading]");
      expect(fading).not.toBeNull();
      expect(host.querySelector("input")).toBe(input);
      const animationEnd = new Event("animationend", { bubbles: true });
      Object.defineProperty(animationEnd, "animationName", { value: "beam-fade-out-test" });
      await act(() => { fading!.dispatchEvent(animationEnd); });
      expect(host.querySelectorAll("style")).toHaveLength(0);
      expect(host.querySelectorAll("[data-beam]")).toHaveLength(0);
      expect(disconnect).toHaveBeenCalled();
      expect(host.querySelector("input")).toBe(input);
      expect(input.value).toBe("Unsaved text");
      expect(document.activeElement).toBe(input);
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  });

  it("releases a faded beam if the browser suppresses its animation event", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const root = createRoot(host);
    const render = (active: boolean) => act(() => root.render(createElement(AgentBeam, {
      active, keepMounted: true, children: createElement("input"),
    })));
    try {
      await render(true);
      const input = host.querySelector("input");
      await render(false);
      await act(() => vi.advanceTimersByTime(700));
      expect(host.querySelector("[data-beam]")).toBeNull();
      expect(host.querySelector("input")).toBe(input);
    } finally {
      await act(() => root.unmount());
    }
  });

  it("leaves inactive panel overlays unmounted and preserves content through activation and fading", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onDeactivate = vi.fn();
    const render = (active: boolean) => act(() => root.render(createElement("section", {
      style: { position: "relative", borderRadius: "16px" },
    }, createElement("input", { defaultValue: "Panel draft" }),
    createElement(AgentBeamOverlay, { active, onDeactivate }))));
    try {
      await render(false);
      expect(host.querySelector("style")).toBeNull();
      expect(observe).not.toHaveBeenCalled();
      expect(matchMedia).not.toHaveBeenCalled();
      const input = host.querySelector("input")!;
      input.focus();
      input.value = "Keep this draft";

      await render(true);
      expect(host.querySelectorAll("style")).toHaveLength(1);
      expect(host.querySelector("[data-beam][data-active]")).not.toBeNull();
      await render(false);
      const fading = host.querySelector("[data-beam][data-fading]")!;
      expect(fading).not.toBeNull();
      expect(onDeactivate).not.toHaveBeenCalled();
      const animationEnd = new Event("animationend", { bubbles: true });
      Object.defineProperty(animationEnd, "animationName", { value: "beam-fade-out-test" });
      await act(() => { fading.dispatchEvent(animationEnd); });
      expect(host.querySelector("style")).toBeNull();
      expect(onDeactivate).toHaveBeenCalledTimes(1);
      expect(host.querySelector("input")).toBe(input);
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe("Keep this draft");
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  });

  it("does not discard an overlay that is reactivated during its exit fade", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const root = createRoot(host);
    const onDeactivate = vi.fn();
    const render = (active: boolean) => act(() => root.render(createElement(AgentBeamOverlay, { active, onDeactivate })));
    try {
      await render(true);
      await render(false);
      await act(() => vi.advanceTimersByTime(300));
      await render(true);
      const fading = host.querySelector("[data-beam][data-fading]")!;
      const animationEnd = new Event("animationend", { bubbles: true });
      Object.defineProperty(animationEnd, "animationName", { value: "beam-fade-out-test" });
      await act(() => { fading.dispatchEvent(animationEnd); });
      await act(() => vi.advanceTimersByTime(700));
      expect(host.querySelector("[data-beam][data-active]")).not.toBeNull();
      expect(onDeactivate).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
    }
  });
});
