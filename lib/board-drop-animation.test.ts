// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOARD_DROP_ANIMATION } from "./board-dnd";

describe("BOARD_DROP_ANIMATION", () => {
  const frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false }),
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: vi.fn(() => ({ finished: Promise.resolve() })),
    });
  });

  afterEach(() => {
    frames.length = 0;
    document.body.replaceChildren();
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    vi.restoreAllMocks();
  });

  it("hides a reconciled destination before the landing flight begins", async () => {
    const source = document.createElement("div");
    source.dataset.issueId = "issue";
    document.body.appendChild(source);
    const overlay = document.createElement("div");
    document.body.appendChild(overlay);

    expect(typeof BOARD_DROP_ANIMATION).toBe("function");
    if (typeof BOARD_DROP_ANIMATION !== "function") {
      throw new Error("Expected a drop animation function");
    }
    const landing = BOARD_DROP_ANIMATION({
      active: { id: "issue" },
      dragOverlay: { node: overlay },
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    } as never);
    expect(source.style.visibility).toBe("hidden");

    const destination = document.createElement("div");
    destination.dataset.issueId = "issue";
    source.replaceWith(destination);
    frames.shift()?.(0);
    expect(destination.style.visibility).toBe("hidden");

    frames.shift()?.(16);
    await landing;
    expect(destination.style.visibility).toBe("");
  });
});
