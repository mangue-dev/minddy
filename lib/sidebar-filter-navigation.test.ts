// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { moveSidebarFilterResultFocus } from "@/lib/keyboard/sidebar-filter-navigation";

describe("secondary sidebar filter result navigation", () => {
  let root: HTMLDivElement;
  let input: HTMLInputElement;
  let first: HTMLButtonElement;
  let second: HTMLAnchorElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    root.innerHTML = `
      <input />
      <button data-sidebar-filter-result>First result</button>
      <button data-sidebar-filter-result disabled>Disabled result</button>
      <a href="/second" data-sidebar-filter-result>Second result</a>
    `;
    document.body.appendChild(root);
    input = root.querySelector("input")!;
    first = root.querySelector("button:not([disabled])")!;
    second = root.querySelector("a")!;
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("moves from the input through the available results and wraps", () => {
    input.focus();

    expect(
      moveSidebarFilterResultFocus({ input, key: "ArrowDown", root }),
    ).toBe(true);
    expect(document.activeElement).toBe(first);

    expect(
      moveSidebarFilterResultFocus({ input, key: "ArrowDown", root }),
    ).toBe(true);
    expect(document.activeElement).toBe(second);

    expect(
      moveSidebarFilterResultFocus({ input, key: "ArrowDown", root }),
    ).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("starts at the last result with ArrowUp and navigates backwards", () => {
    input.focus();

    expect(moveSidebarFilterResultFocus({ input, key: "ArrowUp", root })).toBe(
      true,
    );
    expect(document.activeElement).toBe(second);

    expect(moveSidebarFilterResultFocus({ input, key: "ArrowUp", root })).toBe(
      true,
    );
    expect(document.activeElement).toBe(first);
  });

  it("returns focus to the filter with Escape", () => {
    first.focus();

    expect(moveSidebarFilterResultFocus({ input, key: "Escape", root })).toBe(
      true,
    );
    expect(document.activeElement).toBe(input);
  });

  it("leaves unrelated focus and unsupported keys alone", () => {
    const unrelated = document.createElement("button");
    root.appendChild(unrelated);
    unrelated.focus();

    expect(
      moveSidebarFilterResultFocus({ input, key: "ArrowDown", root }),
    ).toBe(false);
    expect(moveSidebarFilterResultFocus({ input, key: "Enter", root })).toBe(
      false,
    );
    expect(document.activeElement).toBe(unrelated);
  });
});
