// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppTabsProvider,
  useAppTabs,
  useOptionalAppTabs,
  useOptionalAppTabNavigation,
  useOptionalAppTabSession,
} from "./app-tabs-context";
import { createHomeTab } from "./app-tabs";
import type { AppTabsSession } from "./app-tabs-session";

const query = vi.hoisted(() => ({ isPending: false, isError: false, refetch: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { id: "owner" } as { id: string } | null }));
vi.mock("./auth-context", () => ({ useAuth: () => auth }));
vi.mock("./use-app-tabs-query", () => ({
  appTabsQueryKey: (owner: string) => ["app-tabs", owner],
  useAppTabsQuery: () => query,
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/app-tab-route-sync", () => ({ AppTabRouteSync: () => null }));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let session: AppTabsSession;
let renders: { strip: number; navigation: number; actions: number };
const firstId = "10000000-0000-0000-0000-000000000001";
const secondId = "10000000-0000-0000-0000-000000000002";

function Strip() {
  session = useAppTabs().session;
  renders.strip++;
  return null;
}
function Page() {
  const navigation = useOptionalAppTabNavigation();
  renders.navigation++;
  return createElement("span", null, navigation?.activeId);
}
function Actions() {
  useOptionalAppTabSession();
  renders.actions++;
  return null;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  auth.user = { id: "owner" };
  renders = { strip: 0, navigation: 0, actions: 0 };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient();
  await act(() => root.render(createElement(QueryClientProvider, { client },
    createElement(AppTabsProvider, { children: [
      createElement(Strip, { key: "strip" }),
      createElement(Page, { key: "page" }),
      createElement(Actions, { key: "actions" }),
    ] }),
  )));
  await act(async () => {
    session.receive([createHomeTab("owner", firstId), createHomeTab("owner", secondId, 1)]);
    await session.initialize("/home");
  });
});

afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

describe("application tab subscriptions", () => {
  it("replaces the session on account switches and clears optional contexts on sign-out", async () => {
    let values: unknown[] = [];
    function OptionalConsumers() {
      values = [useOptionalAppTabs(), useOptionalAppTabNavigation(), useOptionalAppTabSession()];
      return null;
    }
    const tree = createElement(QueryClientProvider, { client },
      createElement(AppTabsProvider, { children: createElement(OptionalConsumers) }),
    );
    await act(() => root.render(tree));
    const previousSession = values[2] as AppTabsSession;
    const dispose = vi.spyOn(previousSession, "dispose");
    auth.user = { id: "another-owner" };
    await act(() => root.render(createElement(QueryClientProvider, { client },
      createElement(AppTabsProvider, { children: createElement(OptionalConsumers) }),
    )));
    expect(values[2]).not.toBe(previousSession);
    expect((values[2] as AppTabsSession).getSnapshot().activeId).toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
    auth.user = null;
    await act(() => root.render(createElement(QueryClientProvider, { client },
      createElement(AppTabsProvider, { children: createElement(OptionalConsumers) }),
    )));
    expect(values).toEqual([null, null, null]);
  });

  it("updates tab metadata without rendering page or action consumers", async () => {
    const previous = { ...renders };
    await act(() => session.receive(session.getSnapshot().tabs.map((tab) => ({
      ...tab, revision: tab.revision + 1, custom_name: "Renamed remotely",
    }))));
    expect(renders.strip).toBeGreaterThan(previous.strip);
    expect(renders.navigation).toBe(previous.navigation);
    expect(renders.actions).toBe(previous.actions);
  });

  it("keeps departure status local to the strip and publishes actual activation", async () => {
    let release!: (allowed: boolean) => void;
    const unregister = session.registerDeparture(() => new Promise((resolve) => { release = resolve; }));
    const previous = { ...renders };
    let activation!: Promise<void>;
    await act(async () => {
      activation = session.activate(secondId);
      await Promise.resolve();
    });
    expect(session.getSnapshot().busy).toBe(true);
    expect(renders.strip).toBeGreaterThan(previous.strip);
    expect(renders.navigation).toBe(previous.navigation);
    expect(renders.actions).toBe(previous.actions);
    await act(async () => { release(true); await activation; });
    expect(container.textContent).toBe(secondId);
    expect(renders.navigation).toBe(previous.navigation + 1);
    expect(renders.actions).toBe(previous.actions);
    unregister();
  });
});
