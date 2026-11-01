// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import type { PageSummary } from "@/lib/pages-api";
import { TooltipProvider } from "@/components/ui/tooltip";

const h = vi.hoisted(() => ({
  pages: [] as unknown[],
  cellRenders: new Map<string, number>(),
  onOpen: vi.fn(),
  members: [] as never[],
}));

// Three entries in manual order; each cell editor only counts its renders,
// which is how a row re-render shows from the outside.
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => false }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => false }));
vi.mock("@/lib/use-pages-query", () => ({
  usePagesQuery: () => ({
    pages: h.pages,
    createPage: vi.fn(),
    duplicatePage: vi.fn(),
    trashPage: vi.fn(),
    updatePage: vi.fn(),
    prefetchPage: vi.fn(),
  }),
}));
vi.mock("@/lib/use-members-query", () => ({ useMembersQuery: () => ({ members: h.members }) }));
vi.mock("@/lib/use-project-capabilities", () => ({
  useProjectCapabilities: () => ({ canWrite: true, canComment: true }),
}));
vi.mock("@/lib/use-page-database", () => ({
  usePageDatabase: () => ({ saveSchema: vi.fn(), pending: false }),
}));
const config = { sort: "position", descending: false, filters: { match: "and", conditions: [] }, hidden: [] };
vi.mock("@/lib/use-page-database-views", () => ({
  usePageDatabaseViews: () => ({
    views: [], active: null, config, update: vi.fn(), select: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn(), move: vi.fn(),
  }),
}));
vi.mock("./page-promotion-context", () => ({ usePromotePage: () => vi.fn(), usePromotePages: () => vi.fn() }));
// The selection bar is its own surface (bulk-entity-actions tests).
vi.mock("@/components/bulk-entity-actions", () => ({ BulkEntityActions: () => null }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantPanelActions: () => ({ openIntent: vi.fn() }) }));
vi.mock("./page-database-properties", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  DatabasePropertyCell: ({ page }: { page: { id: string } }) => {
    h.cellRenders.set(page.id, (h.cellRenders.get(page.id) ?? 0) + 1);
    return null;
  },
}));

const { PageDatabaseView } = await import("./page-database-view");

const OWNER = "10000000-0000-4000-8000-000000000001";
const database = {
  id: "db",
  title: "Roadmap",
  database_schema: [{ id: OWNER, name: "Owner", type: "text" }],
  database_title_name: null,
} as unknown as PageSummary;
const entry = (id: string, position: string) => ({ id, title: `Entry ${id}`, parent_id: "db", position, icon: null, database_values: {} });

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  h.pages = [entry("a", "a0"), entry("b", "a1"), entry("c", "a2")];
  h.cellRenders.clear();
  h.onOpen.mockClear();
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

async function render() {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TooltipProvider>
          <PageDatabaseView projectId="p1" database={database} onOpen={h.onOpen} />
        </TooltipProvider>
      </NextIntlClientProvider>,
    );
  });
}

const t = en.PageDatabase;
const checkbox = (id: string) => host.querySelector<HTMLElement>(`tr[data-entry-id="${id}"] [role="checkbox"]`)!;
const row = (id: string) => host.querySelector<HTMLElement>(`tr[data-entry-id="${id}"]`)!;

async function openMenu(id: string) {
  const trigger = row(id).querySelector<HTMLElement>(`[aria-label="${t.entryActions}"]`)!;
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  return document.querySelector<HTMLElement>('[role="menu"]')!;
}

it("re-renders only the entry whose selection changed (MIN-875)", async () => {
  await render();
  const before = new Map(h.cellRenders);
  await act(async () => checkbox("b").click());
  expect(row("b").getAttribute("aria-selected")).toBe("true");
  expect(h.cellRenders.get("a")).toBe(before.get("a"));
  expect(h.cellRenders.get("c")).toBe(before.get("c"));
  expect(h.cellRenders.get("b")).toBe((before.get("b") ?? 0) + 1);
});

it("selects a range with shift-click from the last checked entry", async () => {
  await render();
  await act(async () => checkbox("a").click());
  await act(async () => checkbox("c").dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true })));
  expect(["a", "b", "c"].map((id) => row(id).getAttribute("aria-selected"))).toEqual(["true", "true", "true"]);
});

it("offers Open for one entry and drops it when the menu acts on a selection", async () => {
  await render();
  let menu = await openMenu("a");
  expect(menu.textContent).toContain(t.openEntry);
  const open = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.includes(t.openEntry))!;
  await act(async () => open.click());
  expect(h.onOpen).toHaveBeenCalledWith("a");

  await act(async () => checkbox("a").click());
  await act(async () => checkbox("b").click());
  menu = await openMenu("a");
  expect(menu.textContent).not.toContain(t.openEntry);
  expect(menu.textContent).toContain(t.duplicate);
});
