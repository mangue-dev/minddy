// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SavedDatabaseView } from "@/lib/page-databases";

vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => false }));

const { DatabaseViewStrip } = await import("./database-view-strip");

// jsdom lays nothing out: the strip's width and the row's are set by hand,
// and the observers are fired as a resize would.
const STRIP_WIDTH = 500;
let rowWidth = 0;
// dnd-kit observes too, and reads the entries it is handed.
let observers: Array<(entries: unknown[]) => void> = [];
let root: Root;
let host: HTMLDivElement;

const views = ["Backlog", "This week", "Done"].map((name, index) => ({
  id: `v${index}`,
  name,
})) as unknown as SavedDatabaseView[];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  observers = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: (entries: unknown[]) => void) { observers.push(this.callback); }
    observe() {}
    unobserve() {}
    disconnect() { observers = observers.filter((callback) => callback !== this.callback); }
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("role") === "group" ? STRIP_WIDTH : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => rowWidth);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TooltipProvider>
          <DatabaseViewStrip views={views} activeId="v0" canWrite onSelect={vi.fn()} onCreate={vi.fn()}
            onRename={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} />
        </TooltipProvider>
      </NextIntlClientProvider>,
    );
  });
}

async function resizeRow(width: number) {
  rowWidth = width;
  await act(async () => { for (const callback of observers) callback([]); });
}

const strip = () => host.querySelector('[role="group"]');
const picker = () => host.querySelector(`button[aria-label="${en.PageDatabase.views}"]`);

it("shows the pills while the row is wide enough", async () => {
  rowWidth = 800;
  await render();
  expect(strip()?.textContent).toContain("This week");
  expect(picker()).toBeNull();
});

it("gives way to the picker when the pills overflow, and comes back", async () => {
  rowWidth = 400;
  await render();
  expect(strip()).toBeNull();
  expect(picker()?.textContent).toContain("Backlog");

  // Still too narrow for the strip it replaced.
  await resizeRow(499);
  expect(strip()).toBeNull();

  await resizeRow(STRIP_WIDTH);
  expect(strip()).not.toBeNull();
  expect(picker()).toBeNull();

  await resizeRow(300);
  expect(strip()).toBeNull();
  expect(picker()).not.toBeNull();
});
