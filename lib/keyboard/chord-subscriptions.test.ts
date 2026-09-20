// @vitest-environment jsdom

import { act, createElement, memo, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyboardProvider, useChordPrefix, useChordPrefixForEvents } from "./keyboard-context";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/all" }));
vi.mock("@/lib/inbox-launcher", () => ({ openInbox: vi.fn() }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantPanelActions: () => ({ toggle: vi.fn() }) }));
vi.mock("@/lib/sidebar-visibility-context", () => ({ useSidebarVisibility: () => ({ toggle: vi.fn() }) }));
vi.mock("@/lib/scratchpad-context", () => ({ useScratchpad: () => ({ open: vi.fn() }) }));
vi.mock("@/lib/secondary-sidebar-context", () => ({ useSecondarySidebar: () => ({ present: false }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("keyboard chord event readers", () => {
  it("updates visible hints without replaying 600 cards and exposes synchronous event state", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const renderCard = vi.fn();
    let latest: RefObject<string | null> | undefined;
    const hints: (string | null)[] = [];
    const Card = memo(() => { latest = useChordPrefixForEvents(); renderCard(); return null; });
    function Hint() { hints.push(useChordPrefix()); return null; }
    const cards = Array.from({ length: 600 }, (_, index) => createElement(Card, { key: index }));
    const root = createRoot(document.createElement("div"));
    const key = (value: string) => window.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }));
    try {
      await act(() => root.render(createElement(KeyboardProvider, null, ...cards, createElement(Hint))));
      expect(renderCard).toHaveBeenCalledTimes(600);
      await act(() => { key("g"); expect(latest?.current).toBe("g"); });
      expect(hints.at(-1)).toBe("g");
      expect(renderCard).toHaveBeenCalledTimes(600);
      await act(() => { key("b"); expect(latest?.current).toBeNull(); });
      expect(push).toHaveBeenCalledWith("/all");
      expect(hints.at(-1)).toBeNull();
      expect(renderCard).toHaveBeenCalledTimes(600);
      await act(() => { key("g"); key("Escape"); });
      expect(latest?.current).toBeNull();
      expect(push).toHaveBeenCalledTimes(1);
    } finally { await act(() => root.unmount()); }
  });
});
