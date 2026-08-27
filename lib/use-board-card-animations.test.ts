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
  layoutSignal,
  suspended = false,
  onControls,
}: {
  boardColumns: BoardColumn[];
  cardLeft?: number;
  layoutSignal?: unknown;
  suspended?: boolean;
  onControls?: (controls: {
    skipNext: (ids: Iterable<string>) => void;
    unskip: (ids: Iterable<string>) => void;
  }) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const controls = useBoardCardAnimations(
    boardRef,
    boardColumns,
    suspended,
    layoutSignal,
  );
  onControls?.(controls);
  return createElement(
    "div",
    { ref: boardRef, "data-board": true },
    boardColumns.map((column, columnIndex) =>
      createElement(
        "div",
        {
          key: column.status.value,
          "data-board-column-scroller": true,
          "data-left": columnIndex * 300,
        },
        column.items.map((issue) =>
          createElement(
            "div",
            {
              key: issue.id,
              "data-issue-id": issue.id,
              "data-left": cardLeft + columnIndex * 300,
              "data-top": issue.position,
            },
            issue.title,
          ),
        ),
      ),
    ),
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
        const board = this.closest<HTMLElement>("[data-board]");
        const column = this.closest<HTMLElement>(
          "[data-board-column-scroller]",
        );
        const isBoard = this.hasAttribute("data-board");
        const isColumn = this.hasAttribute("data-board-column-scroller");
        const top = isBoard
          ? 0
          : isColumn
            ? 60
            : Number(this.dataset.top ?? 0) + 60 - (column?.scrollTop ?? 0);
        const left =
          Number(this.dataset.left ?? 0) -
          (isBoard ? 0 : (board?.scrollLeft ?? 0));
        const width = isBoard || isColumn ? 600 : 100;
        const height = isBoard ? 600 : isColumn ? 540 : 80;
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
      },
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
    delete (window as typeof window & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it("keeps an optimistic move running through an identical server echo", () => {
    const original = {
      id: "issue",
      title: "Original",
      status: "todo",
      position: 0,
    } as Issue;
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(original) })),
    );

    const optimistic = { ...original, position: 100 };
    act(() =>
      root.render(
        createElement(Harness, { boardColumns: columns(optimistic) }),
      ),
    );
    expect(animations).toHaveLength(1);
    expect(animations[0].cancel).not.toHaveBeenCalled();

    const serverEcho = { ...optimistic, title: "Server version" };
    act(() =>
      root.render(
        createElement(Harness, { boardColumns: columns(serverEcho) }),
      ),
    );

    expect(animations).toHaveLength(1);
    expect(animations[0].cancel).not.toHaveBeenCalled();
    expect(document.body.querySelectorAll("[aria-hidden='true']")).toHaveLength(
      1,
    );
    const clone = document.body.querySelector<HTMLElement>(
      "[aria-hidden='true']",
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
      root.render(createElement(Harness, { boardColumns: columns(original) })),
    );

    const moved = { ...original, position: 20 };
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(moved) })),
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
        }),
      ),
    );

    const moved = { ...original, title: "Moved" };
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: columns(moved),
          cardLeft: 10_000,
        }),
      ),
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
      root.render(createElement(Harness, { boardColumns: columns(original) })),
    );

    const moved = { ...original, position: 10_000 };
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(moved) })),
    );

    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
    expect(document.body.querySelector("[aria-hidden='true']")).toBeNull();
  });

  it("does not mistake a column scroll followed by a server echo for a move", () => {
    const original = {
      id: "issue",
      title: "Original",
      status: "todo",
      position: 100,
    } as Issue;
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(original) })),
    );
    const scroller = container.querySelector<HTMLElement>(
      "[data-board-column-scroller]",
    );
    expect(scroller).not.toBeNull();
    if (!scroller) return;
    scroller.scrollTop = 40;

    const echo = { ...original, title: "Server version" };
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(echo) })),
    );

    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
  });

  it("does not animate when scrolling alone moves a card beyond the clip", () => {
    const original = {
      id: "issue",
      title: "Original",
      status: "todo",
      position: 100,
    } as Issue;
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(original) })),
    );
    const scroller = container.querySelector<HTMLElement>(
      "[data-board-column-scroller]",
    );
    expect(scroller).not.toBeNull();
    if (!scroller) return;
    scroller.scrollTop = 1_000;

    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: columns({ ...original, title: "Server version" }),
        }),
      ),
    );

    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
  });

  it("reveals native cards immediately when scrolling interrupts a FLIP", () => {
    const original = {
      id: "issue",
      title: "Original",
      status: "todo",
      position: 0,
    } as Issue;
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(original) })),
    );
    const moved = { ...original, position: 100 };
    act(() =>
      root.render(createElement(Harness, { boardColumns: columns(moved) })),
    );
    const target = container.querySelector<HTMLElement>("[data-issue-id]");
    const scroller = container.querySelector<HTMLElement>(
      "[data-board-column-scroller]",
    );
    expect(target?.style.visibility).toBe("hidden");
    expect(scroller).not.toBeNull();

    act(() => scroller?.dispatchEvent(new Event("scroll")));

    expect(animations[0].cancel).toHaveBeenCalledTimes(1);
    expect(target?.style.visibility).toBe("");
    expect(document.body.querySelector("[aria-hidden='true']")).toBeNull();
  });

  it("does not rescan every card after drag autoscroll", () => {
    vi.useFakeTimers();
    try {
      const issue = {
        id: "issue",
        title: "Issue",
        status: "todo",
        position: 0,
      } as Issue;
      act(() =>
        root.render(
          createElement(Harness, {
            boardColumns: columns(issue),
            suspended: true,
          }),
        ),
      );
      const beforeScroll = vi.mocked(
        HTMLElement.prototype.getBoundingClientRect,
      ).mock.calls.length;
      const scroller = container.querySelector<HTMLElement>(
        "[data-board-column-scroller]",
      );

      act(() => {
        scroller?.dispatchEvent(new Event("scroll"));
        vi.advanceTimersByTime(200);
      });

      expect(HTMLElement.prototype.getBoundingClientRect).toHaveBeenCalledTimes(
        beforeScroll,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps same-column displaced cards on one shared timeline", () => {
    const first = {
      id: "first",
      title: "First",
      status: "todo",
      position: 0,
    } as Issue;
    const second = {
      id: "second",
      title: "Second",
      status: "todo",
      position: 100,
    } as Issue;
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: [{ status, items: [first, second] }],
        }),
      ),
    );
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: [
            {
              status,
              items: [
                { ...second, position: 0 },
                { ...first, position: 100 },
              ],
            },
          ],
        }),
      ),
    );

    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(2);
    for (const [, options] of vi.mocked(HTMLElement.prototype.animate).mock
      .calls) {
      expect(options).toMatchObject({
        duration: 180,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      });
    }
  });

  it("animates a reserved landing layout before issue data changes", () => {
    const issue = {
      id: "issue",
      title: "Issue",
      status: "todo",
      position: 0,
    } as Issue;
    const stableColumns = columns(issue);
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: stableColumns,
          cardLeft: 0,
        }),
      ),
    );

    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: stableColumns,
          cardLeft: 100,
          layoutSignal: { landing: true },
        }),
      ),
    );

    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(1);
  });

  it("animates a cross-column move from the source column", () => {
    const issue = {
      id: "issue",
      title: "Issue",
      status: "todo",
      position: 0,
    } as Issue;
    const inProgress = { value: "in_progress" } as StatusMeta;
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: [
            { status, items: [issue] },
            { status: inProgress, items: [] },
          ],
        }),
      ),
    );
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: [
            { status, items: [] },
            {
              status: inProgress,
              items: [{ ...issue, status: "in_progress" }],
            },
          ],
        }),
      ),
    );

    const keyframes = vi.mocked(HTMLElement.prototype.animate).mock
      .calls[0][0] as Keyframe[];
    expect(keyframes[0]).toMatchObject({
      transform: "translate3d(-300px, 0px, 0)",
    });
  });

  it("keeps the active card skipped across rapid optimistic and server commits", () => {
    const original = {
      id: "issue",
      title: "Original",
      status: "todo",
      position: 0,
    } as Issue;
    let controls:
      | {
          skipNext: (ids: Iterable<string>) => void;
          unskip: (ids: Iterable<string>) => void;
        }
      | undefined;
    const onControls = (next: typeof controls) => {
      controls = next;
    };
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: columns(original),
          onControls,
        }),
      ),
    );
    controls?.skipNext([original.id]);
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: columns({ ...original, position: 100 }),
          onControls,
        }),
      ),
    );
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: columns({
            ...original,
            title: "Server version",
            position: 200,
          }),
          onControls,
        }),
      ),
    );

    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
  });

  it("releases the active-card skip when landing finishes", () => {
    const original = {
      id: "issue",
      title: "Original",
      status: "todo",
      position: 0,
    } as Issue;
    let controls:
      | {
          skipNext: (ids: Iterable<string>) => void;
          unskip: (ids: Iterable<string>) => void;
        }
      | undefined;
    const onControls = (next: typeof controls) => {
      controls = next;
    };
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: columns(original),
          onControls,
        }),
      ),
    );
    controls?.skipNext([original.id]);
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: columns({ ...original, position: 100 }),
          onControls,
        }),
      ),
    );
    controls?.unskip([original.id]);
    act(() =>
      root.render(
        createElement(Harness, {
          boardColumns: columns({ ...original, position: 200 }),
          onControls,
        }),
      ),
    );

    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(1);
  });
});
