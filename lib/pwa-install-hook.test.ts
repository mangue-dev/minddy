// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePwaInstall } from "@/components/marketing/use-pwa-install";

function Harness() {
  const { canPrompt, promptInstall } = usePwaInstall();
  return createElement(
    "button",
    { onClick: () => void promptInstall() },
    canPrompt ? "ready" : "fallback",
  );
}

describe("usePwaInstall", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(createElement(Harness)));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as typeof window & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("captures Chromium's prompt and consumes it from a click", async () => {
    const prompt = vi.fn().mockResolvedValue({ outcome: "accepted", platform: "web" });
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt });

    act(() => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(container.textContent).toBe("ready");

    await act(async () => container.querySelector("button")?.click());
    expect(prompt).toHaveBeenCalledOnce();
    expect(container.textContent).toBe("fallback");
  });

  it("clears an unused prompt when another installation path succeeds", () => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: vi.fn(),
    });

    act(() => window.dispatchEvent(event));
    expect(container.textContent).toBe("ready");

    act(() => window.dispatchEvent(new Event("appinstalled")));
    expect(container.textContent).toBe("fallback");
  });
});
