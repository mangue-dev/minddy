// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureBoardDragPreview,
  createBoardBoundsModifier,
  measureBoardDragBounds,
  measureBoardDropBundleHeight,
  measureBoardDropVisualTarget,
} from "./board-dnd";

function rect({
  height,
  left,
  top,
  width,
}: {
  height: number;
  left: number;
  top: number;
  width: number;
}) {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  } as DOMRect;
}

describe("board drag overlay", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("captures a static card without duplicate interactive identity", () => {
    document.body.innerHTML = `
      <div data-issue-id="issue" aria-pressed="true" role="button" tabindex="0" class="opacity-40">
        <label id="title">Card</label>
        <input aria-labelledby="title" />
      </div>
    `;

    const html = captureBoardDragPreview("issue");

    expect(html).toContain("Card");
    expect(html).toContain("pointer-events-none");
    expect(html).not.toContain("data-issue-id");
    expect(html).not.toContain("opacity-40");
    expect(html).not.toContain('id="title"');
    expect(html).not.toContain("aria-");
    expect(html).not.toContain("tabindex");
  });

  it("measures the card viewport below column headers", () => {
    const board = document.createElement("div");
    const column = document.createElement("div");
    column.dataset.boardColumnScroller = "";
    board.appendChild(column);
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
      left: 10,
      right: 610,
      top: 20,
      bottom: 620,
    } as DOMRect);
    vi.spyOn(column, "getBoundingClientRect").mockReturnValue({
      left: 10,
      right: 310,
      top: 70,
      bottom: 590,
    } as DOMRect);

    expect(measureBoardDragBounds(board)).toEqual({
      left: 10,
      right: 610,
      top: 70,
      bottom: 590,
    });
  });

  it("clamps the overlay inside cached bounds", () => {
    const modifier = createBoardBoundsModifier({
      current: { left: 0, right: 300, top: 50, bottom: 400 },
    });
    const transform = modifier({
      draggingNodeRect: {
        left: 20,
        right: 120,
        top: 100,
        bottom: 180,
      },
      transform: { x: -50, y: 300, scaleX: 1, scaleY: 1 },
    } as never);

    expect(transform).toEqual({ x: -19, y: 219, scaleX: 1, scaleY: 1 });
  });

  it("measures the rendered marker as an immediate cross-column target", () => {
    const source = document.createElement("article");
    source.dataset.issueId = "issue";
    source.getBoundingClientRect = () =>
      rect({ height: 60, left: 20, top: 100, width: 280 });
    const column = document.createElement("div");
    column.dataset.boardColumnScroller = "";
    column.dataset.boardColumnStatus = "done";
    column.style.rowGap = "8px";
    column.getBoundingClientRect = () =>
      rect({ height: 500, left: 350, top: 70, width: 300 });
    const marker = document.createElement("div");
    marker.dataset.boardDropIndicator = "";
    const anchor = document.createElement("article");
    anchor.getBoundingClientRect = () =>
      rect({ height: 70, left: 360, top: 200, width: 280 });
    column.append(marker, anchor);
    document.body.append(source, column);

    expect(
      measureBoardDropVisualTarget({
        activeId: "issue",
        activeIds: ["issue"],
        bounds: null,
        status: "done",
      }),
    ).toEqual({ height: 60, left: 360, top: 200, width: 280 });
  });

  it("removes the source slot when measuring a same-column reorder", () => {
    const column = document.createElement("div");
    column.dataset.boardColumnScroller = "";
    column.dataset.boardColumnStatus = "todo";
    column.style.rowGap = "8px";
    const source = document.createElement("article");
    source.dataset.issueId = "issue";
    source.getBoundingClientRect = () =>
      rect({ height: 60, left: 20, top: 100, width: 280 });
    const marker = document.createElement("div");
    marker.dataset.boardDropIndicator = "";
    const anchor = document.createElement("article");
    anchor.getBoundingClientRect = () =>
      rect({ height: 70, left: 20, top: 300, width: 280 });
    column.append(source, marker, anchor);
    document.body.append(column);

    expect(
      measureBoardDropVisualTarget({
        activeId: "issue",
        activeIds: ["issue"],
        bounds: null,
        status: "todo",
      })?.top,
    ).toBe(232);
  });

  it("measures an end-of-column marker without a footer anchor", () => {
    const source = document.createElement("article");
    source.dataset.issueId = "issue";
    source.getBoundingClientRect = () =>
      rect({ height: 60, left: 20, top: 100, width: 280 });
    const column = document.createElement("div");
    column.dataset.boardColumnScroller = "";
    column.dataset.boardColumnStatus = "done";
    column.style.rowGap = "8px";
    const previous = document.createElement("article");
    previous.getBoundingClientRect = () =>
      rect({ height: 70, left: 360, top: 200, width: 280 });
    const marker = document.createElement("div");
    marker.dataset.boardDropIndicator = "";
    column.append(previous, marker);
    document.body.append(source, column);

    expect(
      measureBoardDropVisualTarget({
        activeId: "issue",
        activeIds: ["issue"],
        bounds: null,
        status: "done",
      }),
    ).toEqual({ height: 60, left: 360, top: 278, width: 280 });
  });

  it("uses the content padding for an empty destination column", () => {
    const source = document.createElement("article");
    source.dataset.issueId = "issue";
    source.getBoundingClientRect = () =>
      rect({ height: 60, left: 20, top: 100, width: 280 });
    const column = document.createElement("div");
    column.dataset.boardColumnScroller = "";
    column.dataset.boardColumnStatus = "canceled";
    column.style.padding = "8px";
    column.getBoundingClientRect = () =>
      rect({ height: 500, left: 350, top: 70, width: 300 });
    const marker = document.createElement("div");
    marker.dataset.boardDropIndicator = "";
    column.append(marker);
    document.body.append(source, column);

    expect(
      measureBoardDropVisualTarget({
        activeId: "issue",
        activeIds: ["issue"],
        bounds: null,
        status: "canceled",
      }),
    ).toEqual({ height: 60, left: 358, top: 78, width: 284 });
  });

  it("reserves the complete bundle height including internal stack gaps", () => {
    const first = document.createElement("article");
    first.dataset.issueId = "first";
    first.getBoundingClientRect = () =>
      rect({ height: 60, left: 20, top: 100, width: 280 });
    const second = document.createElement("article");
    second.dataset.issueId = "second";
    second.getBoundingClientRect = () =>
      rect({ height: 80, left: 20, top: 168, width: 280 });
    const column = document.createElement("div");
    column.dataset.boardColumnScroller = "";
    column.dataset.boardColumnStatus = "done";
    column.style.rowGap = "8px";
    document.body.append(first, second, column);

    expect(
      measureBoardDropBundleHeight({
        activeIds: ["first", "second"],
        status: "done",
      }),
    ).toBe(148);
  });
});
