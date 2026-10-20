// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AddResourceButton } from "./resources";

// The Radix menu is reduced to what the picker relies on: selecting an item
// closes the menu, which then runs its close-autofocus handler.
const menu = vi.hoisted(() => ({ closeAutoFocus: undefined as undefined | ((event: { preventDefault: () => void }) => void) }));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children, onCloseAutoFocus }: { children: ReactNode; onCloseAutoFocus: typeof menu.closeAutoFocus }) => {
    menu.closeAutoFocus = onCloseAutoFocus;
    return <div>{children}</div>;
  },
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) => (
    <button type="button" onClick={() => { onSelect(); menu.closeAutoFocus?.({ preventDefault: () => {} }); }}>{children}</button>
  ),
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
  useTooltipScope: () => ({ provided: false, insideTrigger: false }),
}));
vi.mock("@/components/search-menu", () => ({
  SearchMenu: ({ open, position, searchPlaceholder, children }: { open: boolean; position: { x: number; y: number } | null; searchPlaceholder: string; children: ReactNode }) =>
    open ? <div data-search-menu data-x={position?.x} data-y={position?.y}><input placeholder={searchPlaceholder} />{children}</div> : null,
}));
vi.mock("@/components/ui/command", () => ({
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: () => null,
  CommandItem: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) => <button type="button" onClick={onSelect}>{children}</button>,
}));
vi.mock("@/lib/use-pages-query", () => ({ usePagesQuery: () => ({ tree: [], loading: false }) }));
vi.mock("@/lib/pages", () => ({ flattenPageTree: () => [{ id: "spec", title: "Specification", icon: null }] }));

const messages = { Resources: { add: "Add", addFile: "File", addLink: "Link", addPage: "Page", pageSearchPlaceholder: "Search a page…", noPages: "No pages", untitledPage: "Untitled" } };
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // The link dialog stays mounted (closed) and reads the layout breakpoint.
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label || b.getAttribute("aria-label") === label)!;

it("opens the page search as a dropdown under the add button instead of a dialog", async () => {
  const onPage = vi.fn();
  await act(() => root.render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddResourceButton onFiles={vi.fn()} onLink={vi.fn()} onPage={onPage} projectId="project" />
    </NextIntlClientProvider>,
  ));
  button("Add").getBoundingClientRect = () => new DOMRect(100, 50, 28, 28);
  expect(host.querySelector("[data-search-menu]")).toBeNull();

  await act(() => button("Page").click());
  const picker = host.querySelector("[data-search-menu]")!;
  // Hung under the button's right edge, like the menu it replaces.
  expect(picker.getAttribute("data-x")).toBe("128");
  expect(picker.getAttribute("data-y")).toBe("82");
  expect(picker.querySelector('input[placeholder="Search a page…"]')).not.toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();

  await act(() => button("Specification").click());
  expect(onPage).toHaveBeenCalledWith({ id: "spec", title: "Specification", icon: null });
  expect(host.querySelector("[data-search-menu]")).toBeNull();
});

it("leaves the trigger's focus alone for the file and link items", async () => {
  await act(() => root.render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddResourceButton onFiles={vi.fn()} onLink={vi.fn().mockResolvedValue(undefined)} onPage={vi.fn()} projectId="project" />
    </NextIntlClientProvider>,
  ));
  const preventDefault = vi.fn();
  menu.closeAutoFocus?.({ preventDefault });
  expect(preventDefault).not.toHaveBeenCalled();
  expect(host.querySelector("[data-search-menu]")).toBeNull();
});
