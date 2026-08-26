// @vitest-environment jsdom

import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardColumn } from "./board-columns";
import { useBoardCardAnimations } from "./use-board-card-animations";
import type { StatusMeta } from "./issue-constants";
import type { Issue } from "./types";

class FakeAnimation extends EventTarget {
  cancel = vi.fn(() => this.dispatchEvent(new Event("cancel")));
}

const status = { value: "todo" } as StatusMeta;

function columns(issue: Issue): BoardColumn[] {
  return [{ status, items: [issue] }];
}

function Harness({
  boardColumns,
  cardLeft = 0,
}: {
  boardColumns: BoardColumn[];
  cardLeft?: number;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  useBoardCardAnimations(boardRef, boardColumns);
  return createElement(
    "div",
    { ref: boardRef, "data-board": true },
    createElement(
      "div",
      { "data-board-column-scroller": true },
      boardColumns.flatMap((column) =>
        column.items.map((issue) =>
          createElement(
            "div",
            {
              key: issue.id,
              "data-issue-id": issue.id,
              "data-left": cardLeft,
              "data-top": issue.position,
            },
            issue.title
          )
        )
      )
    )
  );
}

describe("useBoardCardAnimations", () => {
  let container: HTMLDivElement;
  let root: Root;
  let animations: FakeAnimation[];

  beforeEach(() => {
    (
      window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    animations = [];

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const top = Number(this.dataset.top ?? 0);
        const left = Number(this.dataset.left ?? 0);
        const isViewport =
          this.hasAttribute("data-board") ||
          this.hasAttribute("data-board-column-scroller");
        const width = isViewport ? 600 : 100;
        const height = isViewport ? 600 : 80;
        return {
          x: left,
          y: top,
          top,
          left,
          right: left + width,
          bottom: top + height,
          width,
          height,
          toJSON: () => ({}),
        } as DOMRect;
      }
    );
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: vi.fn(() => {
        const animation = new FakeAnimation();
        animations.push(animation);
        return animation as unknown as Animation;
      }),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    delete (
      window as typeof window & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("keeps an optimistic move running through an identical server echo", () => {
    const original = {
      id: "issue",
      title: "Original",
      status: "todo",
      position: 0,
    } as Issue;
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(original) }))
    );

    const optimistic = { ...original, position: 100 };
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(optimistic) }))
    );
    expect(animations).toHaveLength(1);
    expect(animations[0].cancel).not.toHaveBeenCalled();

    const serverEcho = { ...optimistic, title: "Server version" };
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(serverEcho) }))
    );

    expect(animations).toHaveLength(1);
    expect(animations[0].cancel).not.toHaveBeenCalled();
    expect(document.body.querySelectorAll("[aria-hidden='true']")).toHaveLength(
      1
    );
    const clone = document.body.querySelector<HTMLElement>(
      "[aria-hidden='true']"
    );
    expect(clone?.parentElement?.style.overflow).toBe("hidden");
    expect(clone?.parentElement?.style.zIndex).toBe("20");
  });

  it("starts an off-screen origin at the closest visible edge", () => {
    const original = {
      id: "issue",
      title: "Original",
      status: "todo",
      position: -10_000,
    } as Issue;
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(original) }))
    );

    const moved = { ...original, position: 20 };
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(moved) }))
    );

    const keyframes = vi.mocked(HTMLElement.prototype.animate).mock
      .calls[0][0] as Keyframe[];
    expect(keyframes[0]).toMatchObject({
      opacity: "0",
      transform: "translate3d(0px, -20px, 0)",
    });
    expect(keyframes[1]).toMatchObject({ opacity: "1" });
  });

  it("ends an off-screen destination at the closest horizontal edge", () => {
    const original = {
      id: "issue",
      title: "Original",
      status: "todo",
      position: 20,
    } as Issue;
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: columns(original),
          cardLeft: 100,
        })
      )
    );

    const moved = { ...original, title: "Moved" };
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: columns(moved),
          cardLeft: 10_000,
        })
      )
    );

    const keyframes = vi.mocked(HTMLElement.prototype.animate).mock
      .calls[0][0] as Keyframe[];
    expect(keyframes[0]).toMatchObject({
      opacity: "1",
      transform: "translate3d(-400px, 0px, 0)",
    });
    expect(keyframes[1]).toMatchObject({ opacity: "0" });
  });

  it("does not animate when both endpoints are off-screen", () => {
    const original = {
      id: "issue",
      title: "Original",
      status: "todo",
      position: -10_000,
    } as Issue;
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(original) }))
    );

    const moved = { ...original, position: 10_000 };
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(moved) }))
    );

    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
    expect(document.body.querySelector("[aria-hidden='true']")).toBeNull();
  });
});
