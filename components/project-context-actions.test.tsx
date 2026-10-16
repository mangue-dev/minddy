// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/types";
import { useProjectContextActions, type ProjectContextActions } from "./project-context-actions";

const state = vi.hoisted(() => ({
  pathname: "/projects/a/settings",
  user: { id: "owner" } as { id: string } | null,
  openCreateIssue: vi.fn(), openCreateObjective: vi.fn(), push: vi.fn(), replace: vi.fn(),
  deleteProject: vi.fn(), toast: { error: vi.fn(), success: vi.fn() },
  dialog: null as null | { open: boolean; onConfirm: () => Promise<void>; title: string },
  hidden: new Set<string>(), setProjectHidden: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next-intl", () => ({ useTranslations: (ns: string) => (key: string) => `${ns}.${key}` }));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/lib/create-context", () => ({ useCreate: () => ({ openCreateIssue: state.openCreateIssue, openCreateObjective: state.openCreateObjective }) }));
vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => ({ push: state.push, replace: state.replace }) }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({ deleteProject: state.deleteProject }) }));
vi.mock("@/lib/use-pages-query", () => ({ useCreatePage: () => vi.fn() }));
vi.mock("@/lib/use-hidden-projects", () => ({ useHiddenProjects: () => ({
  isHidden: (id: string) => state.hidden.has(id), setProjectHidden: state.setProjectHidden,
}) }));
vi.mock("mangue-ui", () => ({
  toast: state.toast,
  ConfirmDeleteDialog: (props: { open: boolean; onConfirm: () => Promise<void>; title: string }) => {
    state.dialog = props; return null;
  },
}));

const project = (id: string, owner_id = "owner") => ({ id, name: `Project ${id}`, owner_id }) as Project;
let root: Root, host: HTMLDivElement, actions: ProjectContextActions;
const createPage = vi.fn();
function Probe() {
  actions = useProjectContextActions({ createProjectPage: createPage });
  return actions.dialog as ReactNode;
}
const render = () => act(() => root.render(<Probe />));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.pathname = "/projects/a/settings"; state.user = { id: "owner" }; state.dialog = null; state.hidden = new Set();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("useProjectContextActions", () => {
  it("offers New, Settings, Hide and, for the owner, Move to trash last", async () => {
    await render();
    const menu = actions.projectActions(project("b"));
    expect(menu.map((entry) => entry.id)).toEqual(["project-new", "project-settings", "project-hide", "project-trash"]);
    expect(menu.at(-1)?.variant).toBe("destructive");
    expect(menu[0].children?.map((entry) => entry.id)).toEqual(["project-new-issue", "project-new-objective", "project-new-page"]);
  });

  it("hides Move to trash from members but keeps their personal Hide entry", async () => {
    state.user = { id: "member" };
    await render();
    const ids = actions.projectActions(project("b", "owner")).map((entry) => entry.id);
    expect(ids).not.toContain("project-trash");
    expect(ids).toContain("project-hide");
  });

  it("hides or shows the right-clicked project through the shared preference, never destructively", async () => {
    state.hidden = new Set(["c"]);
    await render();
    const hide = actions.projectActions(project("b")).find((entry) => entry.id === "project-hide")!;
    const show = actions.projectActions(project("c")).find((entry) => entry.id === "project-show")!;
    expect(hide.variant).toBeUndefined();
    expect(show.variant).toBeUndefined();
    hide.onSelect?.(); show.onSelect?.();
    expect(state.setProjectHidden).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: "b" }), true);
    expect(state.setProjectHidden).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: "c" }), false);
  });

  it("binds every creation to the right-clicked project, not the one on screen", async () => {
    await render();
    const [issue, objective, page] = actions.projectActions(project("b"))[0].children!;
    issue.onSelect?.(); objective.onSelect?.(); page.onSelect?.();
    expect(state.openCreateIssue).toHaveBeenCalledWith({ projectId: "b" });
    expect(state.openCreateObjective).toHaveBeenCalledWith({ projectId: "b" });
    expect(createPage).toHaveBeenCalledWith("b");
    actions.tabActions(project("b"), "feedback")[0].onSelect?.();
    expect(state.push).toHaveBeenCalledWith("/projects/b/feedback?new=1");
  });

  it("leaves the screen only when the trashed project is the one displayed", async () => {
    state.deleteProject.mockResolvedValue(undefined);
    await render();
    act(() => actions.projectActions(project("b")).at(-1)!.onSelect!());
    expect(state.dialog?.open).toBe(true);
    await act(() => state.dialog!.onConfirm());
    expect(state.deleteProject).toHaveBeenCalledWith("b");
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.dialog?.open).toBe(false);

    act(() => actions.projectActions(project("a")).at(-1)!.onSelect!());
    await act(() => state.dialog!.onConfirm());
    expect(state.replace).toHaveBeenCalledWith("/home");
  });

  it("keeps the confirmation open when the trash request fails", async () => {
    state.deleteProject.mockRejectedValue(new Error("Refused"));
    await render();
    act(() => actions.projectActions(project("a")).at(-1)!.onSelect!());
    await act(() => state.dialog!.onConfirm());
    expect(state.toast.error).toHaveBeenCalledWith("Refused");
    expect(state.toast.success).not.toHaveBeenCalled();
    expect(state.dialog?.open).toBe(true);
    expect(state.replace).not.toHaveBeenCalled();
  });
});
