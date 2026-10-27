// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DIALOG_EXIT_MS, useResetAfterClose, useValueWhileOpen } from "./use-dialog-close-content";

let root: Root;
let api: ReturnType<typeof useResetAfterClose>;
let shown: string;
const reset = vi.fn();

function Probe({ open, title }: { open: boolean; title: string }) {
  api = useResetAfterClose(open, reset);
  shown = useValueWhileOpen(open, title);
  return null;
}

const render = (open: boolean, title = "") => act(() => root.render(createElement(Probe, { open, title })));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  reset.mockReset();
  root = createRoot(document.createElement("div"));
});

afterEach(async () => {
  await act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("resets only once the close animation is over, and reports the pending reset meanwhile", async () => {
  await render(true);
  api.scheduleReset();
  await render(false);
  expect(reset).not.toHaveBeenCalled();
  expect(api.resetPending.current).toBe(true);

  await act(() => vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS));
  expect(reset).toHaveBeenCalledOnce();
  expect(api.resetPending.current).toBe(false);
});

it("resets before showing a dialog reopened during its close animation", async () => {
  await render(true);
  api.scheduleReset();
  await render(false);
  await render(true);
  expect(reset).toHaveBeenCalledOnce();
  await act(() => vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS));
  expect(reset).toHaveBeenCalledOnce();
});

it("keeps the last open value while closed", async () => {
  await render(true, "Delete “Roadmap”?");
  await render(false, "Delete “”?");
  expect(shown).toBe("Delete “Roadmap”?");
  await render(true, "Delete “Backlog”?");
  expect(shown).toBe("Delete “Backlog”?");
});
