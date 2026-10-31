// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEntitySelection, type EntitySelection } from "./use-entity-selection";

type Item = { id: string };
let container: HTMLDivElement;
let root: Root;
let current: EntitySelection<Item>;

function Probe({ items }: { items: Item[] }) {
  current = useEntitySelection(items);
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("useEntitySelection (MIN-873)", () => {
  it("toggles records in and out, in list order", async () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    await act(() => root.render(createElement(Probe, { items })));
    await act(() => current.toggle("c"));
    await act(() => current.toggle("a"));
    expect(current.selected.map((item) => item.id)).toEqual(["a", "c"]);
    await act(() => current.toggle("c"));
    expect(current.selected.map((item) => item.id)).toEqual(["a"]);
    await act(() => current.clear());
    expect(current.selected).toEqual([]);
  });

  it("drops a record the surface no longer lists", async () => {
    await act(() => root.render(createElement(Probe, { items: [{ id: "a" }, { id: "b" }] })));
    await act(() => current.toggle("a"));
    await act(() => current.toggle("b"));
    await act(() => root.render(createElement(Probe, { items: [{ id: "b" }] })));
    expect(current.selected.map((item) => item.id)).toEqual(["b"]);
    expect(current.isSelected("a")).toBe(false);
  });
});
