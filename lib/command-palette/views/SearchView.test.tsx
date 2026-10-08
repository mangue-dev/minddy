// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaletteConfigProvider, buildCategoryOrder } from "../config";
import { createTranslate } from "../i18n";
import { createActionRegistry } from "../registry/ActionRegistry";
import { ItemActionsProvider } from "../registry/providers/ItemActionsProvider";
import type { ActionExecutionContext } from "../registry/types";
import { configureSearchStorage } from "../search/engine";
import { usePaletteStore } from "../store";
import type { PaletteItem } from "../types";
import type { ResultsListProps } from "../components/ResultsList";
import { SearchView } from "./SearchView";

vi.mock("mangue-ui", async () => await import("../../../node_modules/mangue-ui/src/lib/utils"));
vi.mock("../styles/SearchView.module.css", () => ({ default: {} }));
vi.mock("../components/SearchBar", () => ({ SearchBar: () => null }));
vi.mock("../components/Footer", () => ({ Footer: () => null }));
vi.mock("../components/ActionsPopover", () => ({ ActionsPopover: () => null }));
// Render every result instead of relying on virtual-list measurements in jsdom.
vi.mock("../components/ResultsList", () => ({
  ResultsList: ({ groups, onSelect }: ResultsListProps) => (
    <div role="listbox">
      {groups.map((group) => (
        <section key={group.category} aria-label={group.category}>
          {group.items.map((item) => (
            <button key={item.id} data-item-id={item.id} onClick={() => onSelect(item)}>
              {item.title}
            </button>
          ))}
        </section>
      ))}
    </div>
  ),
}));

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const categories = [{ id: "commands", label: "Commands" }, { id: "issues", label: "Issues" }];
const items: PaletteItem[] = [
  { id: "issue-1", title: "Create issue report", filterCategory: "issues" },
  { id: "command-1", title: "Create issue", filterCategory: "commands" },
  { id: "issue-2", title: "Create issue", filterCategory: "issues" },
];
const translate = createTranslate("en");
const context: ActionExecutionContext = { locale: "en", translate, closeMenu: vi.fn(), meta: {} };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  usePaletteStore.getState().reset();
  localStorage.clear();
  configureSearchStorage("minddy-cp");
  localStorage.setItem("minddy-cp:favorites", JSON.stringify(["issue-1"]));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  localStorage.clear();
  configureSearchStorage("command-palette");
  vi.unstubAllGlobals();
});

async function render() {
  const registry = createActionRegistry();
  registry.register(ItemActionsProvider);
  await act(() => root.render(
    <PaletteConfigProvider value={{ t: translate, locale: "en", categories, categoryOrder: buildCategoryOrder(categories), registry, shortcuts: { actionsKey: ";" } }}>
      <SearchView items={items} actionContext={context} onClose={vi.fn()} />
    </PaletteConfigProvider>
  ));
}

function resultIds() {
  return [...container.querySelectorAll("[data-item-id]")].map((row) => row.getAttribute("data-item-id"));
}

describe("command palette without favorites", () => {
  it("keeps legacy favorites in their original groups and preserves category navigation", async () => {
    await render();
    expect(resultIds()).toEqual(["command-1", "issue-1", "issue-2"]);
    expect([...container.querySelectorAll("section")].map((group) => group.getAttribute("aria-label"))).toEqual(["Commands", "Issues"]);
    await act(() => usePaletteStore.getState().setCategoryFilter("issues"));
    expect(resultIds()).toEqual(["issue-1", "issue-2"]);
  });

  it("ranks matching issues by relevance without reading legacy favorites", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    await render();
    await act(() => usePaletteStore.getState().setQuery("Create issue"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)); });
    expect(resultIds()).toEqual(["command-1", "issue-2", "issue-1"]);
    expect(getItem.mock.calls.some(([key]) => key.endsWith(":favorites"))).toBe(false);
    getItem.mockRestore();
  });

  it("offers only the open action even when a legacy caller supplies favorite callbacks", async () => {
    const toggleFavorite = vi.fn();
    const legacyContext = { ...context, isFavorite: () => true, toggleFavorite };
    const item = { ...items[0], execute: vi.fn(() => false as const) };
    const actions = ItemActionsProvider.getActions(item, legacyContext);
    expect(actions.map((action) => action.id)).toEqual(["item.execute"]);
    expect(ItemActionsProvider.getActions(items[0], legacyContext)).toEqual([]);
    expect(await actions[0].execute!(item, legacyContext)).toEqual({ success: true, closeMenu: false });
    expect(item.execute).toHaveBeenCalledOnce();
    expect(toggleFavorite).not.toHaveBeenCalled();
  });
});
