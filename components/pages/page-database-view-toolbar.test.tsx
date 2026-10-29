// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import type { PageSummary } from "@/lib/pages-api";
import { TooltipProvider } from "@/components/ui/tooltip";

const h = vi.hoisted(() => ({
  mobile: false,
  update: vi.fn(),
}));

// The table's data and the view store are reduced to a database with one
// column and no saved view: what is under test is the toolbar around it.
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => h.mobile }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => false }));
vi.mock("@/lib/use-pages-query", () => ({
  usePagesQuery: () => ({
    pages: [],
    createPage: vi.fn(),
    duplicatePage: vi.fn(),
    trashPage: vi.fn(),
    updatePage: vi.fn(),
    prefetchPage: vi.fn(),
  }),
}));
vi.mock("@/lib/use-members-query", () => ({ useMembersQuery: () => ({ members: [] }) }));
vi.mock("@/lib/use-project-capabilities", () => ({
  useProjectCapabilities: () => ({ canWrite: true, canComment: true }),
}));
vi.mock("@/lib/use-page-database", () => ({
  usePageDatabase: () => ({ saveSchema: vi.fn(), pending: false }),
}));
vi.mock("@/lib/use-page-database-views", () => ({
  usePageDatabaseViews: () => ({
    views: [],
    active: null,
    config: { sort: "position", descending: false, filters: { match: "and", conditions: [] }, hidden: [] },
    update: h.update,
    select: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
  }),
}));
vi.mock("./page-promotion-context", () => ({ usePromotePage: () => vi.fn() }));

const { PageDatabaseView } = await import("./page-database-view");

const database = {
  id: "db",
  title: "Roadmap",
  database_schema: [{ id: "10000000-0000-4000-8000-000000000001", name: "Owner", type: "text" }],
  database_title_name: null,
} as unknown as PageSummary;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  h.mobile = false;
  h.update.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function render(compact: boolean) {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TooltipProvider>
          <PageDatabaseView projectId="p1" database={database} compact={compact} onOpen={vi.fn()} />
        </TooltipProvider>
      </NextIntlClientProvider>,
    );
  });
}

const labelled = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const t = en.PageDatabase;

async function key(element: Element, name: string) {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });
}

async function openSettings() {
  const trigger = labelled(t.viewSettings)!;
  trigger.focus();
  await key(trigger, "Enter");
  return document.querySelector<HTMLElement>('[role="menu"]')!;
}

const menuItem = (menu: Element, label: string) =>
  [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.includes(label))!;

describe("database toolbar in a side panel", () => {
  it("reduces the toolbar to the view picker, search and a settings menu", async () => {
    await render(true);
    expect(labelled(t.views)?.tagName).toBe("BUTTON");
    expect(labelled(t.searchEntries)).not.toBeNull();
    expect(labelled(t.viewSettings)?.getAttribute("aria-haspopup")).toBe("menu");
    // The full page's separate filter, sort and column buttons are gone.
    expect(labelled(t.filter)).toBeNull();
    expect(labelled(t.sort)).toBeNull();
    expect(labelled(t.properties)).toBeNull();
  });

  it("keeps the full page's toolbar outside the panel", async () => {
    await render(false);
    expect(document.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe(t.views);
    expect(labelled(t.filter)).not.toBeNull();
    expect(labelled(t.sort)).not.toBeNull();
    expect(labelled(t.properties)).not.toBeNull();
    expect(labelled(t.viewSettings)).toBeNull();
  });

  it("sorts from the settings menu's submenu", async () => {
    await render(true);
    const menu = await openSettings();
    const sortTrigger = menuItem(menu, t.sort);
    expect(sortTrigger.textContent).toContain(t.manualOrder);
    sortTrigger.focus();
    await key(sortTrigger, "ArrowRight");
    const owner = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
      .find((item) => item.textContent === "Owner")!;
    await act(async () => owner.click());
    expect(h.update).toHaveBeenCalledWith({ sort: database.database_schema![0].id });
  });

  it.each([
    ["filter", t.filter, t.addFilterCondition],
    ["columns", t.properties, t.addProperty],
  ])("opens the %s popover from the settings menu", async (_name, label, content) => {
    await render(true);
    const menu = await openSettings();
    await act(async () => menuItem(menu, label).click());
    // The popover opens once the menu has handed focus back.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    const popover = document.querySelector('[data-slot="popover-content"]');
    expect(popover?.textContent).toContain(content);
  });
});
