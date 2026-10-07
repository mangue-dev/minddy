// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BoardColumnDots } from "./board-column-dots";
import type { StatusMeta } from "@/lib/issue-constants";

vi.mock("mangue-ui", async () => await import("../node_modules/mangue-ui/src/lib/utils"));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let scroller: HTMLDivElement;
let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
const statuses = [{ value: "todo" }, { value: "in_progress" }, { value: "done" }] as StatusMeta[];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  scroller = document.createElement("div");
  Object.defineProperties(scroller, { clientWidth: { value: 320 }, scrollWidth: { value: 960 }, scrollLeft: { value: 0, writable: true } });
  scroller.scrollTo = vi.fn();
  for (const left of [16, 344, 672]) {
    const column = document.createElement("div"); Object.defineProperty(column, "offsetLeft", { value: left }); scroller.appendChild(column);
  }
  document.body.appendChild(scroller);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); scroller.remove(); vi.unstubAllGlobals(); });
async function render(columns = statuses) {
  const ref = createRef<HTMLDivElement>(); ref.current = scroller;
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={{ Status: { todo: "To do", in_progress: "In progress", done: "Done" } }}>
    <BoardColumnDots scroller={ref} statuses={columns} />
  </NextIntlClientProvider>));
}

it("follows swipes and the clamped last column, and lets a dot select a column", async () => {
  await render();
  const current = () => container.querySelector('[aria-current="true"]')?.getAttribute("aria-label");
  expect(current()).toBe("To do");
  await act(() => { scroller.scrollLeft = 328; scroller.dispatchEvent(new Event("scroll")); });
  expect(current()).toBe("In progress");
  await act(() => { scroller.scrollLeft = 640; scroller.dispatchEvent(new Event("scroll")); });
  expect(current()).toBe("Done");
  await act(() => container.querySelector<HTMLButtonElement>('button[aria-label="In progress"]')!.click());
  expect(scroller.scrollTo).toHaveBeenCalledWith({ left: 328, behavior: "smooth" });
});

it("resynchronizes after returning from multiple visible columns to a single column", async () => {
  media.matches = false;
  scroller.scrollLeft = 640;
  await render();
  expect(container.querySelector('[aria-current="true"]')?.getAttribute("aria-label")).toBe("To do");
  await act(() => { media.matches = true; media.addEventListener.mock.calls[0][1](); });
  expect(container.querySelector('[aria-current="true"]')?.getAttribute("aria-label")).toBe("Done");
});

it("omits pagination when there is only one column", async () => {
  await render(statuses.slice(0, 1));
  expect(container.querySelector("[data-board-pagination]")).toBeNull();
});
