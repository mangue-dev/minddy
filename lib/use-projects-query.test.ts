// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectsQuery, type UseProjectsResult } from "@/lib/use-projects-query";

const mocks = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null, loading: true },
  fetchProjectsApi: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/projects-api", () => ({
  fetchProjectsApi: mocks.fetchProjectsApi,
  createProjectApi: vi.fn(),
  updateProjectApi: vi.fn(),
  deleteProjectApi: vi.fn(),
}));

let latest: UseProjectsResult | null = null;
function Harness() {
  latest = useProjectsQuery();
  return null;
}

describe("useProjectsQuery loading (MIN-937)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  beforeEach(() => {
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.auth.user = null;
    mocks.auth.loading = true;
    mocks.fetchProjectsApi.mockReset().mockResolvedValue([{ id: "p1" }]);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    client.clear();
  });

  async function render() {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Harness))));
  }

  it("reads as loading while the session is still being restored", async () => {
    await render();
    expect(latest?.loading).toBe(true);
    expect(latest?.projects).toEqual([]);
    expect(mocks.fetchProjectsApi).not.toHaveBeenCalled();
  });

  it("loads the list once the session is known", async () => {
    mocks.auth.loading = false;
    mocks.auth.user = { id: "u1" };
    await render();
    await vi.waitFor(() => expect(latest?.loading).toBe(false));
    expect(latest?.projects).toEqual([{ id: "p1" }]);
  });

  it("is not loading once a signed-out session is known", async () => {
    mocks.auth.loading = false;
    await render();
    expect(latest?.loading).toBe(false);
  });
});
