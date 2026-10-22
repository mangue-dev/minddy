// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import type { SavedDatabaseView } from "./page-databases";

const h = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: h.toast } }));
vi.mock("./local-snapshots", () => ({
  restoreLocalSnapshot: vi.fn(), removeLocalSnapshot: vi.fn(),
}));

const { usePageDatabaseViews } = await import("./use-page-database-views");

const property = "10000000-0000-4000-8000-000000000001";
let server: SavedDatabaseView[];
let calls: { method: string; url: string; body: unknown }[];
let failCreate: boolean;
let hook: ReturnType<typeof usePageDatabaseViews>;
let root: Root;

function Probe() {
  hook = usePageDatabaseViews("project", "database", true);
  return null;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  server = [];
  calls = [];
  failCreate = false;
  h.toast.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : null;
    calls.push({ method, url, body });
    const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status });
    if (method === "GET") return json(200, { views: server });
    if (method === "POST") {
      if (failCreate) return json(400, { error: "Too many views" });
      const view = { id: `view-${server.length + 1}`, position: server.length + 1, ...body };
      server.push(view);
      return json(201, { view });
    }
    const id = url.split("/").at(-1);
    const target = server.find((view) => view.id === id)!;
    Object.assign(target, body);
    return json(200, { view: target });
  }));
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={en}><Probe /></NextIntlClientProvider>
    </QueryClientProvider>,
  ));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(400); });
const writes = () => calls.filter((call) => call.method !== "GET");

describe("page database views hook", () => {
  it("saves the default view once, then edits it, without the screen falling back", async () => {
    expect(hook.views).toEqual([]);
    await act(async () => hook.update({ sort: property }));
    await settle();
    await act(async () => hook.update({ descending: true }));
    expect(hook.config).toMatchObject({ sort: property, descending: true });
    await settle();
    expect(writes().map((call) => call.method)).toEqual(["POST", "PATCH"]);
    expect(writes()[0].body).toMatchObject({ name: "Table", view: { sort: property } });
    expect(writes()[1].url).toMatch(/\/views\/view-1$/);
    expect(hook.active?.name).toBe("Table");
    expect(hook.config).toMatchObject({ sort: property, descending: true });
  });

  it("reports a failed view creation once, to the caller that shows it", async () => {
    failCreate = true;
    let error: unknown = null;
    await act(async () => { await hook.create("Mine").catch((cause) => { error = cause; }); });
    expect((error as Error).message).toBe("Too many views");
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("creates a named view after saving the default one it starts from", async () => {
    await act(async () => { await hook.create("Mine"); });
    expect(writes().map((call) => (call.body as { name: string }).name)).toEqual(["Table", "Mine"]);
    expect(hook.active?.name).toBe("Mine");
  });
});
