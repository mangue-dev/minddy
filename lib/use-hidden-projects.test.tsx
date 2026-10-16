// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "./types";
import {
  HIDDEN_PROJECTS_KEY,
  useHiddenProjects,
  visibleNavigationProjects,
  type UseHiddenProjectsResult,
} from "./use-hidden-projects";

const h = vi.hoisted(() => ({
  fetch: vi.fn<() => Promise<string[]>>(),
  set: vi.fn<(id: string, hidden: boolean) => Promise<void>>(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("mangue-ui", () => ({ toast: h.toast }));
vi.mock("./auth-context", () => ({ useAuth: () => ({ user: { id: "alice" } }) }));
vi.mock("./hidden-projects-api", () => ({
  fetchHiddenProjectIdsApi: h.fetch,
  setProjectHiddenApi: h.set,
}));

const project = (id: string) => ({ id, name: `Project ${id}` }) as Project;

describe("visibleNavigationProjects", () => {
  const all = [project("a"), project("b"), project("c")];

  it("lists every project when nothing is hidden", () => {
    expect(visibleNavigationProjects(all, new Set())).toBe(all);
  });

  it("leaves hidden projects out of the list", () => {
    expect(visibleNavigationProjects(all, new Set(["b"])).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("keeps a hidden project only while it is the one on screen", () => {
    expect(visibleNavigationProjects(all, new Set(["b"]), "b").map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(visibleNavigationProjects(all, new Set(["b"]), "a").map((p) => p.id)).toEqual(["a", "c"]);
  });
});

describe("useHiddenProjects", () => {
  let root: Root, host: HTMLDivElement, client: QueryClient, result: UseHiddenProjectsResult;
  function Probe() {
    result = useHiddenProjects();
    return null;
  }

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  const render = async () => {
    await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
    await settle();
  };
  /** Lets the query resolve and its result render. */
  const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  it("reads the account preference", async () => {
    h.fetch.mockResolvedValue(["b"]);
    await render();
    expect(result.isHidden("b")).toBe(true);
    expect(result.isHidden("a")).toBe(false);
  });

  it("applies a change at once and keeps it once saved", async () => {
    h.fetch.mockResolvedValueOnce([]).mockResolvedValue(["a"]);
    let resolve!: () => void;
    h.set.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    await render();

    let pending!: Promise<boolean>;
    await act(async () => { pending = result.setProjectHidden(project("a"), true); });
    await settle();
    expect(result.isHidden("a")).toBe(true);
    await act(async () => { resolve(); expect(await pending).toBe(true); });
    await settle();
    expect(h.set).toHaveBeenCalledWith("a", true);
    expect(result.isHidden("a")).toBe(true);
    expect(h.toast.success).toHaveBeenCalledWith("hiddenToast");
  });

  it("restores the previous state when the save fails", async () => {
    h.fetch.mockResolvedValue(["b"]);
    h.set.mockRejectedValue(new Error("offline"));
    await render();

    await act(async () => { expect(await result.setProjectHidden(project("b"), false)).toBe(false); });
    await settle();
    expect(result.isHidden("b")).toBe(true);
    expect(client.getQueryData(HIDDEN_PROJECTS_KEY)).toEqual(["b"]);
    expect(h.toast.error).toHaveBeenCalledWith("showFailed");
  });

  it("rolls a failed hide back even when the preference never loaded", async () => {
    h.fetch.mockRejectedValue(new Error("unavailable"));
    h.set.mockRejectedValue(new Error("unavailable"));
    await render();

    await act(async () => { expect(await result.setProjectHidden(project("a"), true)).toBe(false); });
    await settle();
    expect(result.isHidden("a")).toBe(false);
    expect(h.toast.error).toHaveBeenCalledWith("hideFailed");
  });

  it("hides nothing when the preference cannot be read", async () => {
    h.fetch.mockRejectedValue(new Error("offline"));
    await render();
    expect(result.hiddenProjectIds.size).toBe(0);
  });
});
