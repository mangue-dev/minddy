// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectLookup, type ProjectLookup } from "@/lib/use-project-lookup";

const mocks = vi.hoisted(() => ({
  projects: {
    projects: [] as Array<{ id: string }>,
    loading: false,
    fetching: false,
    hasData: true,
    error: null as Error | null,
    refetch: vi.fn<() => Promise<void>>(),
  },
}));

vi.mock("@/lib/projects-context", () => ({ useProjects: () => mocks.projects }));

let latest: ProjectLookup | null = null;
function Harness({ projectId }: { projectId: string }) {
  latest = useProjectLookup(projectId);
  return null;
}

describe("useProjectLookup (MIN-937)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.assign(mocks.projects, { projects: [], loading: false, fetching: false, hasData: true, error: null });
    mocks.projects.refetch.mockReset().mockResolvedValue(undefined);
    latest = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render(projectId = "p1") {
    await act(async () => root.render(createElement(Harness, { projectId })));
  }

  it("keeps loading while the session and the first read are pending", async () => {
    Object.assign(mocks.projects, { loading: true, hasData: false });
    await render();
    expect(latest?.state).toBe("loading");
    expect(mocks.projects.refetch).not.toHaveBeenCalled();
  });

  it("is ready as soon as the list holds the project", async () => {
    mocks.projects.projects = [{ id: "p1" }];
    await render();
    expect(latest?.state).toBe("ready");
    expect(latest?.project).toEqual({ id: "p1" });
    expect(mocks.projects.refetch).not.toHaveBeenCalled();
  });

  it("reads a list that lacks the project again before saying it is missing", async () => {
    let settle!: () => void;
    mocks.projects.refetch.mockReturnValue(new Promise<void>((resolve) => { settle = resolve; }));
    await render();
    // A restored or older list without the project: not an answer yet.
    expect(latest?.state).toBe("loading");
    expect(mocks.projects.refetch).toHaveBeenCalledOnce();

    await act(async () => settle());
    expect(latest?.state).toBe("missing");
    await render();
    expect(mocks.projects.refetch).toHaveBeenCalledOnce();
  });

  it("finds a project the refreshed list now contains", async () => {
    mocks.projects.refetch.mockImplementation(async () => { mocks.projects.projects = [{ id: "p1" }]; });
    await render();
    await render();
    expect(latest?.state).toBe("ready");
  });

  it("stays loading while a read is in flight", async () => {
    mocks.projects.fetching = true;
    await render();
    expect(latest?.state).toBe("loading");
    expect(mocks.projects.refetch).not.toHaveBeenCalled();
  });

  it("reports a failed read as an error, not as a missing project", async () => {
    Object.assign(mocks.projects, { hasData: false, error: new Error("boom") });
    await render();
    expect(latest?.state).toBe("error");
    act(() => latest?.retry());
    expect(mocks.projects.refetch).toHaveBeenCalledOnce();
  });

  it("confirms each project id on its own", async () => {
    await render("p1");
    expect(latest?.state).toBe("missing");
    await render("p2");
    expect(mocks.projects.refetch).toHaveBeenCalledTimes(2);
    expect(latest?.state).toBe("missing");
  });
});
