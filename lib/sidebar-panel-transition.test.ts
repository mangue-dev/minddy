// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence } from "framer-motion";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarPanelTransition } from "@/components/sidebar-panel-transition";

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
        key: name, className: "panel", offset: 16, transition: { duration: 0.2 },
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
