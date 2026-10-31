// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence } from "framer-motion";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SidebarPanelTransition,
  usePanelDirection,
  type PanelDirection,
} from "@/components/sidebar-panel-transition";

afterEach(() => vi.unstubAllGlobals());

describe("sidebar panel transitions", () => {
  it("disables outgoing controls immediately while the next panel accepts focus and clicks", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const select = vi.fn();
    const render = (name: string) => act(() => root.render(createElement(AnimatePresence, {
      mode: "sync", initial: false,
      children: createElement(SidebarPanelTransition, {
        key: name, className: "panel", direction: 1, transition: { duration: 0.2 },
        children: createElement("button", { onClick: select, "data-panel": name }, name),
      }),
    })));
    try {
      await render("old");
      await render("new");
      const outgoing = host.querySelector<HTMLElement>('[data-panel="old"]')!.parentElement!;
      const incoming = host.querySelector<HTMLButtonElement>('[data-panel="new"]')!;
      expect(outgoing.hasAttribute("inert")).toBe(true);
      expect(outgoing.getAttribute("aria-hidden")).toBe("true");
      expect(outgoing.style.pointerEvents).toBe("none");
      expect(incoming.parentElement?.hasAttribute("inert")).toBe(false);
      incoming.focus();
      incoming.click();
      expect(document.activeElement).toBe(incoming);
      expect(select).toHaveBeenCalledOnce();
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  });
});

describe("level swap direction (MIN-877)", () => {
  const seen: PanelDirection[] = [];
  function Probe({ depth, panelKey }: { depth: number; panelKey: string }) {
    seen.push(usePanelDirection(depth, panelKey));
    return null;
  }

  async function sequence(steps: [number, string][]) {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const root = createRoot(document.createElement("div"));
    const directions: (PanelDirection | undefined)[] = [];
    try {
      for (const [depth, panelKey] of steps) {
        seen.length = 0;
        await act(() => root.render(createElement(Probe, { depth, panelKey })));
        directions.push(seen.at(-1));
      }
    } finally {
      await act(() => root.unmount());
    }
    return directions;
  }

  it("descends and climbs back in opposite directions", async () => {
    expect(await sequence([
      [0, "home"], [1, "project-a"], [2, "secondary"], [1, "project-a"], [0, "home"],
    ])).toEqual([0, 1, 1, -1, -1]);
  });

  it("crossfades a lateral swap and keeps the direction while the panel stays", async () => {
    // A re-render on the same panel (a badge update) replays nothing.
    expect(await sequence([
      [0, "home"], [1, "project-a"], [1, "project-a"], [1, "project-b"],
    ])).toEqual([0, 1, 1, 0]);
  });
});
