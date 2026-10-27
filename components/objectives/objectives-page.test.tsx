// @vitest-environment jsdom
import { Activity, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ObjectivesPage, { ObjectivesCollection } from "./objectives-page";
import { AppTabRouteProvider } from "@/lib/app-tab-route-context";

const state = vi.hoisted(() => ({ projects: [{ id: "p", key: "P", name: "Project P" }, { id: "q", key: "Q", name: "Project Q" }],
  rows: { p: [{ id: "first", name: "First", status: "planned" }, { id: "done", name: "Done", status: "done" }],
    q: [{ id: "other", name: "Other project", status: "planned" }] } as Record<string, { id: string; name: string; status: string }[]>,
  publication: null as unknown }));
vi.mock("@/components/ui/button", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock("@/components/ui/command", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CommandGroup: ({ children }: { children: ReactNode }) => children,
  CommandItem: ({ children, value, onSelect }: { children: ReactNode; value?: string; onSelect?: () => void }) => <button data-command={value} onClick={onSelect}>{children}</button>,
}));
vi.mock("@/components/ui/skeleton", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Skeleton: () => null,
}));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { info: vi.fn() },
}));
vi.mock("@/components/search-menu", () => ({ SearchMenu: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/search-select", () => ({ checkedProps: () => ({}) }));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/components/objective-progress", () => ({ ObjectiveProgressStat: () => null }));
vi.mock("@/components/issue-indicators", () => ({ ObjectiveStatusIndicator: () => null }));
vi.mock("@/components/empty-scene", () => ({ EmptyScene: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/ui/tooltip", () => ({ Tooltip: ({ children }: { children: ReactNode }) => children, TooltipTrigger: ({ children }: { children: ReactNode }) => children, TooltipContent: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => { throw new Error("Retained objectives must not read the live route"); }, useSearchParams: () => { throw new Error("Retained objectives must not read live selection"); } }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({ projects: state.projects, loading: false }) }));
vi.mock("@/lib/use-objectives-query", async (original) => ({ ...await original<typeof import("@/lib/use-objectives-query")>(), useObjectivesQuery: (id: string) => ({ objectives: state.rows[id] ?? [], loading: false, createObjective: vi.fn(), updateObjective: vi.fn(), deleteObjective: vi.fn() }) }));
vi.mock("@/lib/use-issues-query", () => ({ useIssuesQuery: () => ({ issues: [] }) }));
vi.mock("@/lib/use-members-query", () => ({ useMembersQuery: () => ({ members: [] }) }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantContext: () => {}, useAssistantPanelActions: () => ({ open: vi.fn() }) }));
vi.mock("@/lib/current-view-context", () => ({ usePublishCurrentView: (value: unknown) => { state.publication = value; } }));
vi.mock("@/components/secondary-sidebar", () => ({ CollectionSidebar: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => <aside>{actions}{children}</aside> }));
vi.mock("@/components/objective-detail", () => ({ ObjectiveDetail: ({ objective, projectId }: { objective: { id: string }; projectId: string }) => <p data-objective={objective.id} data-project={projectId}>{objective.id}</p> }));
vi.mock("@/lib/mobile-collection-state", async () => {
  const { useState } = await import("react");
  return { useMobileCollectionState: (_route: string, _control: string, initial: unknown) => useState(initial) };
});
vi.mock("@/components/app-link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));

let root: Root; let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  window.history.replaceState(null, "", "/projects/p/objectives?open=done");
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function render({ active = true, project = "p", search = "open=done", browse = false }: { active?: boolean; project?: string; search?: string; browse?: boolean } = {}) {
  await act(() => root.render(<Activity mode={active ? "visible" : "hidden"}><AppTabRouteProvider active={active} route={{ pathname: `/projects/${project}/objectives`, search, projectId: project }}>
    {browse ? <ObjectivesCollection projectId="q" browse={{ onSelect: vi.fn() } as never} /> : <ObjectivesPage />}
  </AppTabRouteProvider></Activity>));
}

it("consumes a completed objective deep link through native history and publishes its selection", async () => {
  const replace = vi.spyOn(window.history, "replaceState"); await render();
  expect(host.querySelector('[data-objective="done"]')).not.toBeNull();
  expect(replace).toHaveBeenCalledWith(null, "", "/projects/p/objectives");
  expect(state.publication).toEqual({ href: "/projects/p/objectives?open=done" });
  await render({ search: "" }); await render({ active: false, search: "" }); await render({ search: "" });
  expect(host.querySelector('[data-objective="done"]')).not.toBeNull();
});

it("lets the reader pick a lens that excludes the open objective while the route still carries it (MIN-814)", async () => {
  // A retained tab keeps `?open=` in its route: it is the published selection.
  await render();
  expect(host.querySelector('[data-objective="done"]')).not.toBeNull();
  await act(() => (host.querySelector('[data-command="state-active"]') as HTMLButtonElement).click());
  await render();
  expect(host.querySelector('[data-objective="done"]')).toBeNull();
  expect(host.querySelector('[data-objective="first"]')).not.toBeNull();
});

it("does not consume selection parameters while its route is hidden", async () => {
  window.history.replaceState(null, "", "/projects/q/objectives?open=other");
  const replace = vi.spyOn(window.history, "replaceState"); await render({ active: false });
  expect(replace).not.toHaveBeenCalled();
  expect(window.location.search).toBe("?open=other");
});

it("uses an explicit browse project without adopting another retained route's project or selection", async () => {
  await render({ browse: true });
  expect(host.querySelector('[data-navigation-href="/projects/q/objectives?open=other"]')).not.toBeNull();
  expect(host.querySelector('[data-navigation-href^="/projects/p/"]')).toBeNull();
  expect(state.publication).toBeNull();
  expect(window.location.search).toBe("?open=done");
});

it("keeps unavailable project handling instead of borrowing another project's cached objectives", async () => {
  await render({ project: "missing", search: "" });
  expect(host.querySelector("[data-objective]")).toBeNull();
  expect(host.textContent).toContain("projectNotFound");
});
