// @vitest-environment jsdom

import { act, createElement, useReducer } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useGlobalBoardQuery } from "@/lib/use-global-board-query";

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/undo/undo-context", () => ({
  useUndoHistory: () => ({ record: vi.fn(), linked: vi.fn(), currentLink: () => null }),
}));
// The global board never answers here: its value stays the loading fallback.
vi.mock("@/lib/global-board-api", () => ({ globalBoardQueryFn: () => new Promise(() => {}) }));

/**
 * While a query has no data, its hook must hand back the SAME empty values on
 * every render. A fresh `[]` or `{}` each time broke the memoized board
 * columns and cards that receive them, and re-rendered every card on each
 * update of the board page during a cold load (MIN-875).
 */
describe("query hooks keep stable fallbacks while loading", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
  });

  function renderTwice<T>(useValue: () => T): [T, T] {
    const seen: T[] = [];
    let rerender: () => void = () => {};
    function Probe() {
      const [, bump] = useReducer((n: number) => n + 1, 0);
      rerender = bump;
      seen.push(useValue());
      return null;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
    act(() => rerender());
    return [seen[0], seen.at(-1) as T];
  }

  it("members", () => {
    const [first, last] = renderTwice(() => useMembersQuery("project-1", false));
    expect(last.members).toBe(first.members);
    expect(last.invitations).toBe(first.invitations);
  });

  it("categories", () => {
    const [first, last] = renderTwice(() => useCategoriesQuery(null).categories);
    expect(last).toBe(first);
  });

  it("project issues", () => {
    const [first, last] = renderTwice(() => useIssuesQuery(null).issues);
    expect(last).toBe(first);
  });

  it("global board", () => {
    const [first, last] = renderTwice(() => useGlobalBoardQuery());
    expect(last.issues).toBe(first.issues);
    expect(last.relations).toBe(first.relations);
    expect(last.membersByProject).toBe(first.membersByProject);
    expect(last.categoriesByProject).toBe(first.categoriesByProject);
    expect(last.objectivesByProject).toBe(first.objectivesByProject);
    expect(last.integrationsByProject).toBe(first.integrationsByProject);
  });
});
