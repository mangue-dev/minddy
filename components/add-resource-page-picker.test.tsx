// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PalettePickerTestHost } from "@/test/palette-picker-host";
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
const pages = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/use-pages-query", () => ({ usePagesQuery: () => ({ tree: [], loading: false }), useCreatePage: () => pages.create }));
vi.mock("@/lib/pages", () => ({ flattenPageTree: () => [{ id: "spec", title: "Specification", icon: null }] }));
const panel = vi.hoisted(() => ({ openPage: vi.fn(), closePage: vi.fn() }));
vi.mock("@/lib/page-panel-context", () => ({ useOptionalPagePanelActions: () => panel }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const messages = {
  Resources: { add: "Add", addFile: "File", addLink: "Link", addPage: "Page", pageSearchPlaceholder: "Search a page to add…", noPages: "No pages", untitledPage: "Untitled", newPage: "New page", newPageNamed: "New page “{title}”" },
  Pages: { createFailed: "Could not create the page." },
  Common: { loading: "Loading…" },
};
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
  vi.clearAllMocks();
});

const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label || b.getAttribute("aria-label") === label)!;

const PICKER = "[data-palette-picker]";

it("opens the page search in the palette, with a placeholder that says what it is for (MIN-844)", async () => {
  const onPage = vi.fn();
  await act(() => root.render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddResourceButton onFiles={vi.fn()} onLink={vi.fn()} onPage={onPage} projectId="project" />
      <PalettePickerTestHost />
    </NextIntlClientProvider>,
  ));
  expect(host.querySelector(PICKER)).toBeNull();

  await act(() => button("Page").click());
  const picker = host.querySelector(PICKER)!;
  expect(picker.querySelector('input[placeholder="Search a page to add…"]')).not.toBeNull();

  await act(() => button("Specification").click());
  expect(onPage).toHaveBeenCalledWith({ id: "spec", title: "Specification", icon: null });
  expect(host.querySelector(PICKER)).toBeNull();
});

it("forgets the picker when the palette closes without a choice", async () => {
  const onPage = vi.fn();
  await openPicker(onPage);
  await act(() => button("Close picker").click());
  expect(host.querySelector(PICKER)).toBeNull();
  // Reopening shows it again: the surface reset its own state.
  await act(() => button("Page").click());
  expect(host.querySelector(PICKER)).not.toBeNull();
  expect(onPage).not.toHaveBeenCalled();
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
  expect(host.querySelector(PICKER)).toBeNull();
});

/** A creation whose server answer the test settles by hand. */
function pendingCreation(id: string, title: string) {
  let settle!: () => void;
  let fail!: (error: Error) => void;
  const settled = new Promise((resolve, reject) => {
    settle = () => resolve({ id });
    fail = reject;
  });
  pages.create.mockResolvedValueOnce({ id, title, icon: null, settled });
  return { settle, fail };
}

async function openPicker(onPage: (page: { id: string; title: string; icon: string | null }) => void) {
  await act(() => root.render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddResourceButton onFiles={vi.fn()} onLink={vi.fn()} onPage={onPage} projectId="project" />
      <PalettePickerTestHost />
    </NextIntlClientProvider>,
  ));
  await act(() => button("Page").click());
}

function typeSearch(value: string) {
  const input = host.querySelector<HTMLInputElement>(`${PICKER} input`)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("creates a page titled by the search, opens it in the panel, then cites it once saved", async () => {
  const onPage = vi.fn();
  const creation = pendingCreation("fresh", "Launch notes");
  await openPicker(onPage);

  await act(() => typeSearch("  Launch notes "));
  await act(() => button("New page “Launch notes”").click());

  expect(pages.create).toHaveBeenCalledWith("project", { title: "Launch notes" });
  expect(panel.openPage).toHaveBeenCalledWith("project", "fresh");
  expect(host.querySelector(PICKER)).toBeNull();
  // The resource row needs the page on the server: nothing is cited before.
  expect(onPage).not.toHaveBeenCalled();

  await act(async () => creation.settle());
  expect(onPage).toHaveBeenCalledWith({ id: "fresh", title: "Launch notes", icon: null });
});

it("creates an untitled page when nothing is typed", async () => {
  const onPage = vi.fn();
  const creation = pendingCreation("blank", "");
  await openPicker(onPage);

  await act(() => button("New page").click());
  await act(async () => creation.settle());

  expect(pages.create).toHaveBeenCalledWith("project", {});
  expect(onPage).toHaveBeenCalledWith({ id: "blank", title: "", icon: null });
});

it("closes the panel and cites nothing when the creation fails", async () => {
  const onPage = vi.fn();
  const creation = pendingCreation("lost", "");
  await openPicker(onPage);

  await act(() => button("New page").click());
  await act(async () => creation.fail(new Error("Quota reached")));

  expect(onPage).not.toHaveBeenCalled();
  expect(panel.closePage).toHaveBeenCalled();
  expect(toastError).toHaveBeenCalledWith("Quota reached");
});
