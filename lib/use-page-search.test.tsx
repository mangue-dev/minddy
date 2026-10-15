// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePaletteStore } from "@/lib/command-palette/store";
import type { PageSearchHit } from "./types";
import { usePageContentSearch } from "./use-page-search";

const searched = vi.hoisted(() => [] as string[]);
vi.mock("./page-content-search-query", () => ({
  pageContentSearchQuery: (query: string) => ({
    queryKey: ["me", "pages", "search", query],
    queryFn: async (): Promise<PageSearchHit[]> => {
      searched.push(query);
      return [{
        id: `page-${query}`, project_id: "project", parent_id: null, title: query,
        icon: null, updated_at: "2026-10-01T00:00:00Z", excerpt: `about ${query}`, rank: 1,
      }];
    },
  }),
}));

let host: HTMLDivElement;
let root: Root;
let renders: number;
let hits: PageSearchHit[];

function Host({ enabled }: { enabled: boolean }) {
  renders++;
  hits = usePageContentSearch(enabled);
  return null;
}

async function type(query: string) {
  await act(async () => { usePaletteStore.getState().setQuery(query); });
}

/** Lets the debounce fire, then the query resolve and notify its observer. */
async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(220); });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  usePaletteStore.getState().setQuery("");
  searched.length = 0;
  renders = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={client}><Host enabled /></QueryClientProvider>);
  });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("page content search", () => {
  it("does not re-render its host on each keystroke", async () => {
    const mounted = renders;
    await type("a");
    expect(renders).toBe(mounted);
    await type("ab");
    // Crossing the minimum length is the only typing-time update.
    const searchable = renders;
    expect(searchable).toBeGreaterThan(mounted);
    await type("abc");
    await type("abcd");
    expect(renders).toBe(searchable);
    expect(searched).toEqual([]);

    await settle();
    expect(searched).toEqual(["abcd"]);
    expect(hits.map((hit) => hit.id)).toEqual(["page-abcd"]);
  });

  it("drops hits as soon as the query falls below the minimum length", async () => {
    await type("notes");
    await settle();
    expect(hits).toHaveLength(1);
    await type("n");
    expect(hits).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(searched).toEqual(["notes"]);
  });

  it("stays silent and searches nothing while the palette is closed", async () => {
    const client = new QueryClient();
    await act(async () => {
      root.render(<QueryClientProvider client={client}><Host enabled={false} /></QueryClientProvider>);
    });
    const closed = renders;
    await type("roadmap");
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(renders).toBe(closed);
    expect(searched).toEqual([]);
    expect(hits).toEqual([]);
  });
});
