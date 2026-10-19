// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaletteGroup } from "@/components/header-search-pill";
import {
  usePaletteDataGroups,
  useWikiPageNavigation,
  type PaletteModelState,
} from "./use-palette-data-groups";
import { useObjectivesQuery } from "./use-objectives-query";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.unstubAllGlobals();
});

async function render(node: ReactNode) {
  await act(async () => { root.render(node); });
}

describe("usePaletteDataGroups", () => {
  const issues = [{ id: "issue" }];
  const objectives = [{ id: "objective" }];
  const pages = [{ id: "page" }];
  const build = vi.fn((): PaletteGroup[] => [{ key: "issues", items: [] }]);
  let groups: PaletteGroup[] = [];

  function Model({ state, rows = issues }: { state: PaletteModelState; rows?: typeof issues }) {
    groups = usePaletteDataGroups(state, build, rows, objectives, pages);
    return null;
  }

  beforeEach(() => { build.mockClear(); });

  it("keeps the desktop model across opening and closing the palette", async () => {
    await render(<Model state={{ mounted: false, mobileLayout: false, open: false }} />);
    expect(groups).toEqual([]);
    expect(build).not.toHaveBeenCalled();

    await render(<Model state={{ mounted: true, mobileLayout: false, open: false }} />);
    const warm = groups;
    expect(build).toHaveBeenCalledOnce();
    await render(<Model state={{ mounted: true, mobileLayout: false, open: true }} />);
    await render(<Model state={{ mounted: true, mobileLayout: false, open: false }} />);
    expect(build).toHaveBeenCalledOnce();
    expect(groups).toBe(warm);

    await render(<Model state={{ mounted: true, mobileLayout: false, open: false }} rows={[{ id: "new" }]} />);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("builds the narrow-window model only while the palette is open", async () => {
    await render(<Model state={{ mounted: true, mobileLayout: true, open: false }} />);
    expect(build).not.toHaveBeenCalled();
    await render(<Model state={{ mounted: true, mobileLayout: true, open: true }} />);
    expect(build).toHaveBeenCalledOnce();
    expect(groups).toHaveLength(1);
    await render(<Model state={{ mounted: true, mobileLayout: true, open: false }} />);
    expect(groups).toEqual([]);
  });
});

describe("useWikiPageNavigation", () => {
  it("keeps one identity across routes and reads the current pathname when called", async () => {
    const push = vi.fn();
    const openDestination = vi.fn();
    const pushState = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    let navigate!: (projectId: string, pageId: string) => void;
    function Navigation({ pathname }: { pathname: string }) {
      navigate = useWikiPageNavigation(pathname, { push }, openDestination);
      return null;
    }
    try {
      await render(<Navigation pathname="/projects/p1/pages/a" />);
      const first = navigate;
      navigate("p1", "b");
      expect(openDestination).toHaveBeenCalledWith("/projects/p1/pages/b", expect.any(Function));
      openDestination.mock.calls[0][1]();
      expect(pushState).toHaveBeenCalledWith(null, "", "/projects/p1/pages/b");
      expect(push).not.toHaveBeenCalled();

      await render(<Navigation pathname="/home" />);
      expect(navigate).toBe(first);
      navigate("p1", "b");
      expect(push).toHaveBeenCalledWith("/projects/p1/pages/b");
      expect(openDestination).toHaveBeenCalledOnce();
    } finally {
      pushState.mockRestore();
    }
  });
});

describe("closed palette inputs", () => {
  it("return the same empty list on every render before it loads", async () => {
    const client = new QueryClient();
    const seen: unknown[] = [];
    function Inputs({ tick }: { tick: number }) {
      const { objectives } = useObjectivesQuery(null);
      seen[tick] = objectives;
      return null;
    }
    await render(<QueryClientProvider client={client}><Inputs tick={0} /></QueryClientProvider>);
    await render(<QueryClientProvider client={client}><Inputs tick={1} /></QueryClientProvider>);
    expect(seen[1]).toBe(seen[0]);
  });
});
