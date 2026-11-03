// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { ContextMenuAction } from "./issue-context-menu";
import { useBoardReorderActions } from "./use-board-reorder-actions";
import type { Issue } from "@/lib/types";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

afterEach(() => vi.unstubAllGlobals());

const card = (id: string, position: number) => ({ id, status: "todo", position }) as Issue;
const column = [card("a", 0), card("b", 10), card("c", 20)];

async function build(enabled: boolean, move = vi.fn(async () => {})) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let builder: ((issue: Issue) => ContextMenuAction[]) | undefined;
  function Probe() {
    builder = useBoardReorderActions({ columns: [{ status: { value: "todo" }, items: column }], enabled, move });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Probe)));
  await act(async () => root.unmount());
  return builder;
}

it("offers no reorder entries outside manual sort", async () => {
  expect(await build(false)).toBeUndefined();
});

it("disables the moves a card cannot make and writes the one chosen", async () => {
  const move = vi.fn(async () => {});
  const builder = await build(true, move);
  const [reorder] = builder!(column[0]);
  expect(reorder.id).toBe("reorder");
  const entries = Object.fromEntries(reorder.children!.map((entry) => [entry.id, entry]));
  expect(entries["reorder-up"].disabled).toBe(true);
  expect(entries["reorder-top"].disabled).toBe(true);
  expect(entries["reorder-down"].disabled).toBe(false);
  vi.stubGlobal("requestAnimationFrame", () => 0);
  entries["reorder-down"].onSelect!();
  expect(move).toHaveBeenCalledWith({ issue: column[0], patch: { position: 15 } });
});
