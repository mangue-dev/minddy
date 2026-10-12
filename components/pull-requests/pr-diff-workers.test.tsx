// @vitest-environment jsdom
import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { preparedDiffLanguages, PrDiffRuntimePreparation } from "./pr-diff-workers";

const runtime = vi.hoisted(() => ({ initialize: vi.fn(async () => {}), preload: vi.fn(async () => {}), providers: vi.fn() }));
vi.mock("@pierre/diffs", async (original) => ({ ...await original<typeof import("@pierre/diffs")>(), preloadHighlighter: runtime.preload }));
vi.mock("@pierre/diffs/react", () => {
  const pool = { initialize: runtime.initialize };
  return {
    useWorkerPool: () => pool,
    WorkerPoolContextProvider: ({ children, ...options }: { children: ReactNode }) => {
      runtime.providers(options); return createElement(Fragment, null, children);
    },
  };
});
vi.mock("./use-effective-color-scheme", () => ({ useEffectiveColorScheme: () => "light" }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("bounds public grammar preparation across repeated file types", () => {
  expect(preparedDiffLanguages(["one.ts", "two.ts", "README.md", "plain.csv"])).toEqual(["typescript", "markdown", "csv"]);
  expect(preparedDiffLanguages(["one.ts", "two.js", "three.py", "four.rb", "five.go", "six.rs"])).toHaveLength(5);
});

it("prepares both themes in the existing two-worker pool and preserves it across matching language renders", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  try {
    await act(() => root.render(<PrDiffRuntimePreparation languages={["markdown", "text"]} />));
    expect(runtime.initialize).toHaveBeenCalledWith(["markdown", "text"]);
    expect(runtime.preload).toHaveBeenCalledWith({ themes: expect.arrayContaining(["pierre-light", "github-dark-default"]), langs: ["markdown", "text"], preferredHighlighter: "shiki-js" });
    expect(runtime.providers.mock.calls[0][0].poolOptions.poolSize).toBe(2);
    await act(() => root.render(<PrDiffRuntimePreparation languages={["markdown", "text"]} />));
    expect(runtime.preload).toHaveBeenCalledTimes(1);
    await act(() => root.render(<PrDiffRuntimePreparation languages={["typescript"]} />));
    expect(runtime.preload).toHaveBeenCalledTimes(2);
  } finally { await act(() => root.unmount()); }
});
