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

function Harness({ boardColumns }: { boardColumns: BoardColumn[] }) {
  const boardRef = useRef<HTMLDivElement>(null);
  useBoardCardAnimations(boardRef, boardColumns);
  return createElement(
    "div",
    { ref: boardRef, "data-board": true },
    boardColumns.flatMap((column) =>
      column.items.map((issue) =>
        createElement(
          "div",
          {
            key: issue.id,
            "data-issue-id": issue.id,
            "data-top": issue.position,
          },
          issue.title
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
        return {
          x: 0,
          y: top,
          top,
          left: 0,
          right: 100,
          bottom: top + 80,
          width: 100,
          height: 80,
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
  });
});
