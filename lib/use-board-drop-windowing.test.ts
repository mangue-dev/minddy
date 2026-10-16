// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useBoardDrop, type BoardDrop } from "./use-board-drop";
import { STATUSES } from "./issue-constants";
import type { Issue } from "./types";

it("resolves newly mounted manual targets and changing window geometry during one drag", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), board = document.createElement("div"), column = document.createElement("div");
  column.dataset.boardColumnScroller = ""; column.dataset.boardWindowed = "";
  board.append(column); document.body.append(host, board);
  const issues = ["a", "b", "c"].map((id, index) => ({ id, status: "todo", position: index * 10 } as Issue));
  const issueMap = new Map(issues.map((issue) => [issue.id, issue]));
  const status = STATUSES.find((status) => status.value === "todo")!;
  const root = createRoot(host);
  let drop: BoardDrop;
  function Hook() {
    drop = useBoardDrop({ root: { current: board }, columns: [{ status, items: issues }],
      makeComparator: () => (a, b) => a.position - b.position, manual: true, issueMap, selectedIds: new Set() });
    return null;
  }
  try {
    await act(() => root.render(createElement(Hook)));
    const active = { id: "a", rect: { current: { translated: { top: 130, left: 0, width: 100, height: 50 } } } };
    await act(() => drop!.start({ active } as Parameters<BoardDrop["start"]>[0]));
    // Autoscroll mounts this row after the drag's initial node snapshot.
    const target = document.createElement("div");
    target.dataset.issueId = "c"; target.dataset.columnStatus = "todo";
    let top = 100;
    target.getBoundingClientRect = () => ({ top, left: 0, width: 100, height: 50, bottom: top + 50, right: 100 } as DOMRect);
    column.append(target);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
    const event = { active, over: { id: "todo" } } as Parameters<BoardDrop["plan"]>[0];
    expect(drop!.plan(event)?.moves[0].patch.position).toBeGreaterThan(20);
    // The same mounted node moves when preceding row estimates are corrected.
    top = 250;
    expect(drop!.plan(event)?.moves[0].patch.position).toBe(15);
  } finally {
    await act(() => root.unmount()); host.remove(); board.remove();
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    vi.unstubAllGlobals();
  }
});
