import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createPrTabPreparation } from "./pr-tab-preparation";
import { createPrActivityPreparation } from "./pr-activity-preparation";
import { navigationPreparationPending } from "./navigation-preparation-priority";

vi.mock("./app-tab-surfaces", () => ({ prepareAppTabSurface: vi.fn(async () => {}), isAppTabSurfaceReady: () => true }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["pull-request", "pr"], { pr: { title: "Prepared detail" } });
  const tabs = new Set<() => void>(), auxiliary = new Set<() => void>();
  const navigation = createPrTabPreparation(client, (task) => { tabs.add(task); return () => { tabs.delete(task); }; });
  const activity = createPrActivityPreparation(client, (task, delay) => {
    if (delay <= 50) auxiliary.add(task);
    return () => { auxiliary.delete(task); };
  });
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => Response.json(String(url).endsWith("/pages/page")
    ? { id: "page", content: { type: "doc", content: [] } }
    : String(url).endsWith("/pages") ? []
    : String(url).endsWith("/commits") ? { commits: [] } : { comments: [], timeline: [] }));
  vi.stubGlobal("fetch", fetch);
  const flush = async (tasks: Set<() => void>) => {
    for (const task of Array.from(tasks)) { tasks.delete(task); task(); }
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    await Promise.resolve();
  };
  return { client, navigation, activity, fetch, tabs, auxiliary, flush,
    close: () => { navigation.dispose(); activity.dispose(); client.clear(); } };
}

it("prepares open Page prerequisites before optional PR activity and resumes without polling", async () => {
  const view = setup();
  try {
    view.activity.update(["pr"]);
    view.navigation.visit("/home", ["/home", "/projects/project/pages/page"]);
    expect(navigationPreparationPending(view.client)).toBe(true);
    expect(view.auxiliary.size).toBe(0);
    for (let step = 0; step < 4 && view.tabs.size; step++) await view.flush(view.tabs);
    expect(navigationPreparationPending(view.client)).toBe(false);
    expect(view.fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/projects/project/pages/page", "/api/projects/project/pages",
    ]);
    await view.flush(view.auxiliary);
    expect(view.fetch.mock.calls.some(([url]) => String(url).endsWith("/comments"))).toBe(true);
  } finally { view.close(); }
});

it("releases priority after failed prerequisites and when a navigation owner is retired", async () => {
  const view = setup();
  try {
    view.fetch.mockRejectedValueOnce(new Error("Unavailable Page"));
    view.activity.update(["pr"]);
    view.navigation.visit("/home", ["/home", "/projects/project/pages/page"]);
    for (let step = 0; step < 4 && view.tabs.size; step++) await view.flush(view.tabs);
    expect(navigationPreparationPending(view.client)).toBe(false);
    view.navigation.visit("/home", ["/home", "/projects/project/pages/another"]);
    expect(navigationPreparationPending(view.client)).toBe(true);
    view.navigation.dispose();
    expect(navigationPreparationPending(view.client)).toBe(false);
    expect(view.tabs.size).toBe(0);
    await view.flush(view.auxiliary);
    expect(view.fetch.mock.calls.some(([url]) => String(url).endsWith("/comments"))).toBe(true);
  } finally { view.close(); }
});
