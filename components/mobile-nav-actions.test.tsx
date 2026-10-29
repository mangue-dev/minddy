// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MobileNotebookButton } from "./mobile-nav-actions";

const scratchpad = vi.hoisted(() => ({ open: vi.fn(), progress: { done: 0, total: 0 } }));
vi.mock("@/lib/scratchpad-context", () => ({ useScratchpad: () => ({ open: scratchpad.open }) }));
vi.mock("@/lib/use-scratchpad-query", () => ({ useScratchpadProgress: () => scratchpad.progress }));
vi.mock("@/lib/keyboard/use-mod-shortcut", () => ({ useModShiftShortcut: () => "⌘⇧K" }));

const messages = { Scratchpad: {
  openAria: "Open task notebook ({shortcut})",
  tasksLeft: "{count, plural, one {# task left} other {# tasks left}}",
} };
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  scratchpad.open.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

const render = () => act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}><MobileNotebookButton /></NextIntlClientProvider>));
const button = () => container.querySelector<HTMLButtonElement>("[data-mobile-notebook-launcher]")!;

it("opens the task notebook as a click from the bottom bar", async () => {
  scratchpad.progress = { done: 0, total: 0 };
  await render();
  expect(button().getAttribute("aria-label")).toBe("Open task notebook (⌘⇧K)");
  await act(() => button().click());
  expect(scratchpad.open).toHaveBeenCalledExactlyOnceWith("click");
});

it("announces the tasks still to do", async () => {
  scratchpad.progress = { done: 1, total: 3 };
  await render();
  expect(button().getAttribute("aria-label")).toBe("Open task notebook (⌘⇧K) — 2 tasks left");
});
