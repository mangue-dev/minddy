// @vitest-environment jsdom
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ auth: { user: null as { id: string } | null, loading: true }, mounts: [] as number[], next: 0 }));
vi.mock("./auth-context", () => ({ useAuth: () => h.auth }));
vi.mock("./query-provider", () => ({
  AppQueryProvider: ({ children }: { children: React.ReactNode }) => {
    // One identity per mounted provider instance, i.e. per QueryClient.
    const [instance] = React.useState(() => ++h.next);
    useEffect(() => { h.mounts.push(instance); }, [instance]);
    return <>{children}</>;
  },
}));
const { AccountQueryProvider, INITIAL_ACCOUNT_CACHE_SCOPE, nextAccountCacheScope } = await import("./account-query-provider");

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const render = (auth: typeof h.auth) => act(() => {
  h.auth = auth;
  root.render(<AccountQueryProvider><span /></AccountQueryProvider>);
});
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  root = createRoot(host);
  h.mounts = []; h.next = 0;
});
afterEach(() => act(() => root.unmount()));

it("keeps the startup cache when auth first resolves to the cookie account", async () => {
  await render({ user: null, loading: true });
  await render({ user: { id: "owner" }, loading: false });
  await render({ user: { id: "owner" }, loading: false });
  expect(h.mounts).toEqual([1]);
});

it("discards the cache on every later identity change", async () => {
  await render({ user: null, loading: true });
  await render({ user: { id: "owner" }, loading: false });
  await render({ user: null, loading: false });
  await render({ user: { id: "other" }, loading: false });
  await render({ user: { id: "owner" }, loading: false });
  expect(h.mounts).toEqual([1, 2, 3, 4]);
});

it("remounts when a signed-out first resolution later recovers an account", () => {
  const resolved = nextAccountCacheScope(INITIAL_ACCOUNT_CACHE_SCOPE, false, null);
  expect(resolved.key).toBe(INITIAL_ACCOUNT_CACHE_SCOPE.key);
  const recovered = nextAccountCacheScope(resolved, false, "owner");
  expect(recovered).toEqual({ key: "owner", owner: "owner" });
  expect(nextAccountCacheScope(recovered, true, "owner")).toBe(recovered);
});
