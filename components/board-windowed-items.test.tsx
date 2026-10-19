// @vitest-environment jsdom

import React, { Activity, act, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardWindowedItems } from "./board-windowed-items";
import { boardRowHeight } from "@/lib/board-windowing";
import type { BoardLandingPreview } from "./board-drop-indicator";

const drag = vi.hoisted(() => ({ active: null as { id: string } | null }));
vi.mock("@dnd-kit/core", () => ({ useDndContext: () => drag }));

class GeometryObserver {
  static observers = new Set<GeometryObserver>();
  nodes = new Set<Element>();
  constructor(private callback: ResizeObserverCallback) { GeometryObserver.observers.add(this); }
  observe(node: Element) { this.nodes.add(node); }
  unobserve(node: Element) { this.nodes.delete(node); }
  disconnect() { this.nodes.clear(); GeometryObserver.observers.delete(this); }
  static resize() {
    for (const observer of this.observers) {
      const entries = [...observer.nodes].map((node) => ({ target: node, borderBoxSize: [{ inlineSize: 320, blockSize: (node as HTMLElement).offsetHeight }] }));
      if (entries.length) observer.callback(entries as unknown as ResizeObserverEntry[], observer as unknown as ResizeObserver);
    }
  }
}

beforeEach(() => {
  drag.active = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  vi.stubGlobal("ResizeObserver", GeometryObserver);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function(this: HTMLElement) {
    if (this.dataset.boardColumnScroller !== undefined) return 500;
    if (this.style.height === "0px") return 0;
    const placeholder = this.querySelector<HTMLElement>(":scope > [data-board-drop-placeholder]");
    return (placeholder ? Number.parseFloat(placeholder.style.height) : this.dataset.boardRowId === "0" ? 900 : 100) + (Number.parseFloat(this.style.paddingBottom) || 0);
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    return { height: this.offsetHeight, width: 320, top: 0, left: 0, bottom: this.offsetHeight, right: 320, x: 0, y: 0, toJSON: () => ({}) };
  });
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function(this: HTMLElement) {
    return [this.getBoundingClientRect()] as unknown as DOMRectList;
  });
  HTMLElement.prototype.scrollTo = function(options?: ScrollToOptions | number) {
    if (typeof options === "object") this.scrollTop = options.top ?? this.scrollTop;
    this.dispatchEvent(new Event("scroll"));
  };
});

afterEach(() => {
  GeometryObserver.observers.clear();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function Card({ id, onInteractionChange }: { id: string; onInteractionChange: (id: string, open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState(false);
  useLayoutEffect(() => onInteractionChange(id, open), [id, open, onInteractionChange]);
  return <article data-issue-id={id}>
    <button onClick={() => setOpen(!open)}>Dialog</button>
    <button aria-expanded={field} onClick={() => setField(!field)}>Field</button>
    {open && <input defaultValue="draft" />}
  </article>;
}

async function setup(count = 100) {
  const host = document.createElement("div"), column = document.createElement("div");
  column.dataset.boardColumnScroller = ""; column.dataset.boardColumnStatus = "todo";
  column.tabIndex = -1; column.append(host); document.body.append(column);
  const root = createRoot(host), scrollerRef = { current: column };
  const issues = Array.from({ length: count }, (_, id) => ({ id: String(id) }));
  const render = (active = true, items = issues, landingPreview?: BoardLandingPreview) => root.render(<Activity mode={active ? "visible" : "hidden"}>
    <BoardWindowedItems issues={items} status="todo" scrollerRef={scrollerRef} landingPreview={landingPreview}
      renderIssue={(issue, changed) => <Card id={issue.id} onInteractionChange={changed} />} />
  </Activity>);
  await act(() => render());
  await act(() => GeometryObserver.resize());
  return { column, host, issues, render, scroll: async (top: number) => {
    await act(() => { column.scrollTop = top; column.dispatchEvent(new Event("scroll")); GeometryObserver.resize(); });
  }, close: async () => { await act(() => root.unmount()); column.remove(); } };
}

describe("measured board windows", () => {
  it("windows ordinary project columns and preserves an open draft across the natural-flow boundary", async () => {
    const board = await setup(20);
    try {
      expect(board.host.querySelector("[data-board-windowed]")).not.toBeNull();
      expect(board.host.querySelectorAll("article").length).toBeLessThan(20);
      const card = board.host.querySelector('[data-issue-id="0"]')!;
      await act(() => (card.querySelector("button") as HTMLElement).click());
      const input = card.querySelector("input")!; input.value = "Unsent project draft";
      await act(() => board.render(true, board.issues.slice(0, 16)));
      expect(board.host.querySelector("[data-board-windowed]")).toBeNull();
      expect(board.host.querySelectorAll("article")).toHaveLength(16);
      expect(board.host.querySelector('[data-issue-id="0"] input')).toBe(input);
      await act(() => board.render()); await act(() => GeometryObserver.resize());
      expect(board.host.querySelector("[data-board-windowed]")).not.toBeNull();
      expect(board.host.querySelector('[data-issue-id="0"] input')).toBe(input);
      expect(input.value).toBe("Unsent project draft");
      expect(boardRowHeight(board.column, "0")).toBe(900);
    } finally { await board.close(); }
  });
  it("reserves one complete landing bundle and pins distant zero-volume source rows", async () => {
    const board = await setup(20);
    try {
      const landing: BoardLandingPreview = { status: "todo", count: 2, beforeIssueId: "1", activeIds: new Set(["0", "19"]), height: 420 };
      await act(() => board.render(true, board.issues, landing));
      await act(() => GeometryObserver.resize());
      expect(board.host.querySelectorAll("[data-board-drop-placeholder]")).toHaveLength(1);
      expect((board.host.querySelector("[data-board-drop-placeholder]") as HTMLElement).style.height).toBe("420px");
      for (const id of landing.activeIds) {
        const row = board.host.querySelector<HTMLElement>(`[data-board-row-id="${id}"]`)!;
        expect(row.style.height).toBe("0px"); expect(row.style.position).toBe("absolute");
      }
      await board.scroll(1800);
      expect(board.host.querySelectorAll("[data-board-drop-placeholder]")).toHaveLength(1);
      expect(board.host.querySelector('[data-board-row-id="0"]')).not.toBeNull();
      await act(() => board.render());
      expect(board.host.querySelector("[data-board-drop-placeholder]")).toBeNull();
    } finally { await board.close(); }
  });
  it("measures oversized rows and preserves an open dialog draft outside the visible range", async () => {
    const board = await setup();
    try {
      expect(board.host.querySelectorAll("article").length).toBeLessThan(20);
      expect(boardRowHeight(board.column, "0")).toBe(900);
      const card = board.host.querySelector('[data-issue-id="0"]')!;
      await act(() => (card.querySelector("button") as HTMLElement).click());
      const draft = card.querySelector("input")!; draft.value = "unfinished draft";
      await board.scroll(18000);
      expect(board.host.querySelector('[data-issue-id="0"] input')).toBe(draft);
      expect(draft.value).toBe("unfinished draft");
      expect(board.host.querySelectorAll("article").length).toBeLessThan(25);
      await act(() => (card.querySelector("button") as HTMLElement).click());
      await board.scroll(18020);
      expect(board.host.querySelector('[data-issue-id="0"]')).toBeNull();
    } finally { await board.close(); }
  });

  it("pins a field popover independently of card-owned dialogs", async () => {
    const board = await setup();
    try {
      const card = board.host.querySelector('[data-issue-id="1"]')!;
      const field = card.querySelectorAll("button")[1];
      await act(() => field.click());
      await board.scroll(18000);
      expect(board.host.querySelector('[data-issue-id="1"]')).toBe(card);
      await act(() => field.click());
      await board.scroll(18020);
      expect(board.host.querySelector('[data-issue-id="1"]')).toBeNull();
    } finally { await board.close(); }
  });

  it("keeps active drag and focus owners, then releases them when interactions end", async () => {
    const board = await setup();
    try {
      const button = board.host.querySelector('[data-issue-id="0"] button') as HTMLElement;
      await act(() => button.focus());
      drag.active = { id: "2" }; await act(() => board.render());
      await board.scroll(18000);
      expect(board.host.querySelector('[data-issue-id="0"] button')).toBe(button);
      expect(board.host.querySelector('[data-issue-id="2"]')).not.toBeNull();
      await act(() => board.column.focus());
      drag.active = null; await act(() => board.render());
      expect(board.host.querySelector('[data-issue-id="0"]')).toBeNull();
      expect(board.host.querySelector('[data-issue-id="2"]')).toBeNull();
    } finally { await board.close(); }
  });

  it("mounts one neighbour row in the first commit and widens the window at idle", async () => {
    const idle: IdleRequestCallback[] = [];
    vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => idle.push(callback));
    vi.stubGlobal("cancelIdleCallback", () => {});
    const board = await setup();
    try {
      // Row 0 measures 900 px in a 500 px scroller: it is the only visible row.
      const rows = () => [...board.host.querySelectorAll("article")].map((card) => card.getAttribute("data-issue-id"));
      expect(rows()).toEqual(["0", "1"]);
      expect(idle).toHaveLength(1);
      await act(() => idle.splice(0).forEach((callback) => callback({ didTimeout: false, timeRemaining: () => 50 })));
      expect(rows()).toEqual(["0", "1", "2", "3", "4", "5"]);
      await act(() => board.render());
      expect(idle).toHaveLength(0);
    } finally { await board.close(); }
  });

  it("retains measured geometry through Activity and reads hidden source changes on return", async () => {
    const board = await setup();
    try {
      await board.scroll(16000);
      const retained = board.host.querySelector("[data-board-windowed]");
      await act(() => board.render(false));
      expect(boardRowHeight(board.column, "0")).toBeNull();
      const next = board.issues.filter((issue) => issue.id !== "0");
      await act(() => board.render(false, next));
      await act(() => board.render(true, next));
      await act(() => GeometryObserver.resize());
      expect(board.host.querySelector("[data-board-windowed]")).toBe(retained);
      expect(boardRowHeight(board.column, "0")).toBeNull();
      expect(boardRowHeight(board.column, "99")).toBeGreaterThan(0);
      expect(board.host.querySelectorAll("article").length).toBeLessThan(25);
    } finally { await board.close(); }
  });
});
