// @vitest-environment jsdom
import { Activity, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RoutinesRoute from "@/app/(app)/routines/page";
import { AppTabRouteProvider } from "@/lib/app-tab-route-context";
import { NavigationContext } from "@/lib/app-tab-navigation-context";
import type { AppTabsSession } from "@/lib/app-tabs-session";

const state = vi.hoisted(() => ({ allowed: true, selected: null as string | null, select: (_id: string | null) => {}, publication: null as unknown }));
vi.mock("@/components/ui/button", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Button: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => { throw new Error("Retained routines must not read the live route"); }, useSearchParams: () => { throw new Error("Retained routines must not read live selection"); } }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/use-billing-query", () => ({ usePlanGates: () => ({ loading: false, agentsAllowed: state.allowed }) }));
vi.mock("@/components/app-link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/current-view-context", () => ({ usePublishCurrentView: (value: unknown) => { state.publication = value; } }));
vi.mock("@/components/routines/routines-panel", () => ({ RoutinesPanel: ({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) => {
  state.selected = selectedId; state.select = onSelect; return <p data-selection>{selectedId ?? "No selection"}</p>;
} }));

let root: Root; let host: HTMLDivElement; let activeTab: string;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.allowed = true; state.selected = null; state.publication = null; activeTab = "routines";
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  window.history.replaceState(null, "", "/routines?routine=one");
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const session = { getSnapshot: () => ({ activeId: activeTab }) } as unknown as AppTabsSession;
async function render(active = true, search = "routine=one") {
  await act(() => root.render(<NavigationContext.Provider value={{ session, activeId: "routines" }}>
    <Activity mode={active ? "visible" : "hidden"}><AppTabRouteProvider active={active} route={{ pathname: "/routines", search, projectId: null }}>
      <RoutinesRoute />
    </AppTabRouteProvider></Activity>
  </NavigationContext.Provider>));
}

it("keeps the plan gate around locally mounted routines", async () => {
  state.allowed = false; await render();
  expect(host.querySelector("[data-selection]")).toBeNull();
  expect(host.textContent).toContain("agentsGateTitle");
  state.allowed = true; await render();
  expect(state.selected).toBe("one");
});

it("reads and publishes the scoped selection and changes it through native history", async () => {
  await render(); const replace = vi.spyOn(window.history, "replaceState");
  await act(() => state.select("two"));
  expect(replace).toHaveBeenCalledWith(null, "", "/routines?routine=two");
  expect(state.selected).toBe("two");
  expect(state.publication).toEqual({ href: "/routines?routine=two" });
  await render(true, "routine=two"); await render(false, "routine=two"); await render(true, "routine=two");
  expect(state.selected).toBe("two");
});

it("does not let a delayed hidden-tab selection change another routines tab's address", async () => {
  await render(); const delayedSelection = state.select;
  activeTab = "another-routines"; window.history.replaceState(null, "", "/routines?routine=other");
  await render(false); const replace = vi.spyOn(window.history, "replaceState");
  await act(() => delayedSelection("late"));
  expect(replace).not.toHaveBeenCalled();
  expect(window.location.search).toBe("?routine=other");
});
