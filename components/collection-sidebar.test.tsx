// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CollectionSidebar } from "./secondary-sidebar";
import { SecondarySidebarProvider, useSecondarySidebar } from "@/lib/secondary-sidebar-context";

vi.mock("next/navigation", () => ({ usePathname: () => "/home", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => true }));
vi.mock("@/lib/use-media-query", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMediaQuery: () => true,
}));
const menu = vi.hoisted(() => ({ position: null as unknown, actions: [] as { id: string }[] }));
vi.mock("@/components/issue-context-menu", () => ({ IssueContextMenu: (props: { position: unknown; actions: { id: string }[] }) => {
  menu.position = props.position; menu.actions = props.actions; return null;
} }));
vi.mock("@/components/sidebar-filter-field", () => ({ SidebarFilterField: () => <input aria-label="Filter" /> }));
vi.mock("@/components/navigation-context-actions", () => ({ useNavigationContextActions: (href: string | null | undefined) =>
  href ? [{ id: "navigation-open-new-tab", label: "Open in new tab", separatorBefore: true }] : [] }));

afterEach(() => vi.unstubAllGlobals());
it("browses actual rows without registering another route sidebar and navigates only final destinations", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const header = document.createElement("div");
  document.body.append(host, header);
  const root = createRoot(host);
  const navigate = vi.fn(), selectLocally = vi.fn(), toggleGroup = vi.fn(), create = vi.fn();
  let registered = false;
  function Inspector() { registered = useSecondarySidebar().present; return null; }
  try {
    await act(() => root.render(<SecondarySidebarProvider><Inspector /><CollectionSidebar
      browse={{ headerHost: header, onSelect: navigate }} title="Code review"
      filter={{ value: "", onChange: () => {}, placeholder: "Filter", clearLabel: "Clear" }}
      actions={<button onClick={create}>Create</button>}>
      <button data-group onClick={toggleGroup}>Review group</button>
      <button data-navigation-href="/pull-requests?pr=second" onClick={selectLocally}><span data-row-label>Second PR</span></button>
    </CollectionSidebar></SecondarySidebarProvider>));
    expect(registered).toBe(false);
    expect(header.querySelector("input")).not.toBeNull();
    await act(() => host.querySelector<HTMLButtonElement>("[data-group]")!.click());
    await act(() => header.querySelector<HTMLButtonElement>("button")!.click());
    expect(toggleGroup).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    await act(() => host.querySelector<HTMLElement>("[data-row-label]")!.click());
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/pull-requests?pr=second");
    expect(selectLocally).not.toHaveBeenCalled();
    await act(() => host.querySelector("[data-navigation-href]")!.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true })));
    expect(selectLocally).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledOnce();
    await act(() => root.unmount());
    expect(header.childElementCount).toBe(0);
  } finally { host.remove(); header.remove(); }
});

it("answers a right click on a nested row label with that row's actions, without selecting or navigating", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const navigate = vi.fn(), selectLocally = vi.fn(), opened = vi.fn();
  const itemContextActions = vi.fn((target: Element) => {
    const id = target.closest<HTMLElement>("[data-row-id]")?.dataset.rowId;
    return [
      { id: `trash-${id}`, label: "Move to trash", variant: "destructive" as const },
      { id: `edit-${id}`, label: "Edit" },
    ];
  });
  try {
    await act(() => root.render(<SecondarySidebarProvider><CollectionSidebar
      browse={{ onSelect: navigate }} title="Routines" itemContextActions={itemContextActions} onItemContextMenu={opened}>
      <button data-row-id="first" data-navigation-href="/routines?routine=first" onClick={selectLocally}>First</button>
      <button data-row-id="second" data-navigation-href="/routines?routine=second" onClick={selectLocally}><span data-row-label>Second</span></button>
    </CollectionSidebar></SecondarySidebarProvider>));
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 34 });
    await act(() => host.querySelector("[data-row-label]")!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(menu.position).toMatchObject({ x: 12, y: 34, href: "/routines?routine=second" });
    expect(menu.actions.map((action) => action.id)).toEqual(["edit-second", "navigation-open-new-tab", "trash-second"]);
    expect(opened).toHaveBeenCalledWith(host.querySelector('[data-row-id="second"]'));
    expect(navigate).not.toHaveBeenCalled();
    expect(selectLocally).not.toHaveBeenCalled();
    await act(() => root.unmount());
  } finally { host.remove(); }
});
