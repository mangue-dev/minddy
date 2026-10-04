// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { QueryReadBoundary } from "@/components/query-read-boundary";

afterEach(() => vi.unstubAllGlobals());

it("conceals uncertain data from sight, interaction and accessibility while preserving drafts and scroll", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let mounts = 0;
  function Editor() {
    const [draft] = useState(() => { mounts++; return "Unsent reply"; });
    return createElement("div", { "data-scroller": true }, createElement("input", { defaultValue: draft }));
  }
  const render = (phase: "fresh" | "loading" | "refreshing" | "error" | "paused") => act(() => root.render(
    createElement(QueryReadBoundary, {
      phase, fallback: createElement("div", { "data-fallback": true }, phase === "error" ? "Try again" : ""),
      children: createElement(Editor),
    }),
  ));
  try {
    await render("fresh");
    const input = container.querySelector("input")!;
    input.value = "Edited reply";
    const scroller = container.querySelector<HTMLElement>("[data-scroller]")!;
    scroller.scrollTop = 240;
    for (const phase of ["loading", "refreshing", "error", "paused"] as const) {
      await render(phase);
      expect(getComputedStyle(input).visibility).toBe("hidden");
      expect(input.closest("[inert][aria-hidden='true']")).not.toBeNull();
      expect(container.querySelector("[data-fallback]")).not.toBeNull();
      expect(container.firstElementChild?.getAttribute("aria-busy")).toBe(String(phase === "loading" || phase === "refreshing"));
    }
    await render("fresh");
    expect(container.querySelector("input")).toBe(input);
    expect(getComputedStyle(input).visibility).toBe("visible");
    expect(input.value).toBe("Edited reply");
    expect(scroller.scrollTop).toBe(240);
    expect(mounts).toBe(1);
    expect(input.closest("[inert]")).toBeNull();
    expect(container.querySelector("[data-fallback]")).toBeNull();
  } finally {
    await act(() => root.unmount()); container.remove();
  }
});
