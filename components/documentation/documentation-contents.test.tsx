// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentationContents } from "./documentation-contents";

vi.mock("mangue-ui", () => import("mangue-ui/components/ui/collapsible"));

let root: Root;
let host: HTMLDivElement;
let article: HTMLElement;
let tops: Record<string, number>;
let resize: (() => void)[];
let rowHeight: number;
const sections = [
  { id: "overview", title: "Overview", level: 2 },
  { id: "steps", title: "Steps", level: 2 },
  { id: "details", title: "Details", level: 3 },
];
const scrollIntoView = vi.fn();

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  resize = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize.push(callback); }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("scrollY", 0);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(3000);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
  tops = { overview: 300, steps: 600, details: 1200 };
  rowHeight = 28;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = this.tagName === "A" ? 100 + sections.findIndex(section => this.getAttribute("href") === `#${section.id}`) * rowHeight : tops[this.id] ?? 100;
    return { top, height: this.tagName === "UL" ? rowHeight * 3 : rowHeight } as DOMRect;
  });
  window.history.replaceState(null, "", "/docs/example");
  article = document.createElement("article");
  article.id = "documentation-article";
  article.innerHTML = sections.map(section => `<section id="${section.id}" tabindex="-1" style="scroll-margin-top:96px"><h2>${section.title}</h2><p>Section body</p></section>`).join("");
  host = document.createElement("div");
  document.body.append(article, host);
  root = createRoot(host);
  await act(() => root.render(<DocumentationContents sections={sections} label="Contents" />));
});

afterEach(async () => {
  await act(() => root.unmount());
  article.remove();
  host.remove();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
  vi.useRealTimers();
  scrollIntoView.mockClear();
});

const desktop = () => host.querySelector("aside")!;
const link = (id: string) => desktop().querySelector<HTMLAnchorElement>(`a[href="#${id}"]`)!;
const heading = (id: string) => article.querySelector(`#${id} h2`)!;
const frame = async () => { await act(() => vi.advanceTimersByTime(16)); };

it("tracks the reading section, moves one persistent caret and updates its geometry after resize", async () => {
  const caret = desktop().querySelector<HTMLElement>("[data-documentation-caret]")!;
  expect(link("overview").getAttribute("aria-current")).toBe("location");
  expect(caret.style.transform).toBe("translateY(6px)");
  tops = { overview: -700, steps: 110, details: 800 };
  await act(() => window.dispatchEvent(new Event("scroll")));
  await frame();
  expect(link("steps").getAttribute("aria-current")).toBe("location");
  expect(desktop().querySelector("[data-documentation-caret]")).toBe(caret);
  expect(caret.style.transform).toBe("translateY(34px)");
  rowHeight = 48;
  await act(() => resize.forEach(callback => callback()));
  await frame();
  expect(link("steps").getAttribute("aria-current")).toBe("location");
  expect(caret.style.transform).toBe("translateY(54px)");
  expect(caret.style.height).toBe("36px");
  vi.stubGlobal("scrollY", 3000 - window.innerHeight);
  await act(() => window.dispatchEvent(new Event("scroll")));
  await frame();
  expect(link("details").getAttribute("aria-current")).toBe("location");
  expect(caret.style.transform).toBe("translateY(102px)");
});

it("scrolls and focuses the anchor, pulses only its heading, and restarts feedback on repeated clicks", async () => {
  await act(() => link("steps").click());
  await frame();
  expect(window.location.hash).toBe("#steps");
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  expect(document.activeElement?.id).toBe("steps");
  expect(heading("steps").classList.contains("page-block-target")).toBe(true);
  expect(article.querySelector("#steps")?.classList.contains("page-block-target")).toBe(false);
  await act(() => vi.advanceTimersByTime(1000));
  await act(() => link("steps").click());
  expect(heading("steps").classList.contains("page-block-target")).toBe(false);
  await frame();
  expect(heading("steps").classList.contains("page-block-target")).toBe(true);
  await act(() => link("details").click());
  await frame();
  expect(heading("steps").classList.contains("page-block-target")).toBe(false);
  expect(heading("details").classList.contains("page-block-target")).toBe(true);
  await act(() => vi.advanceTimersByTime(1700));
  expect(heading("details").classList.contains("page-block-target")).toBe(false);
});

it("preserves modified anchor clicks and closes the mobile contents after selection", async () => {
  await act(() => link("steps").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })));
  expect(scrollIntoView).not.toHaveBeenCalled();
  expect(window.location.hash).toBe("");
  const trigger = host.querySelector<HTMLButtonElement>("button")!;
  expect(trigger.textContent).toBe("Overview");
  await act(() => trigger.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  const mobileLink = host.querySelector<HTMLAnchorElement>('a[href="#steps"]')!;
  await act(() => mobileLink.click());
  await frame();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(trigger.textContent).toBe("Steps");
  expect(heading("steps").classList.contains("page-block-target")).toBe(true);
});
