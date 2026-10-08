// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CollectionSidebar } from "./secondary-sidebar";
import { SecondarySidebarProvider, useSecondarySidebar } from "@/lib/secondary-sidebar-context";

vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => true }));
vi.mock("mangue-ui", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" "), useMediaQuery: () => true }));
vi.mock("@/components/issue-context-menu", () => ({ IssueContextMenu: () => null }));
vi.mock("@/components/sidebar-filter-field", () => ({ SidebarFilterField: () => <input aria-label="Filter" /> }));
vi.mock("@/components/navigation-context-actions", () => ({ useNavigationContextActions: () => [] }));

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
