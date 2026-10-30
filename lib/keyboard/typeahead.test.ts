// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyboardProvider } from "./keyboard-context";
import { TYPEAHEAD_WINDOW_MS, useTypeaheadTarget } from "./typeahead";

const state = vi.hoisted(() => ({ push: vi.fn(), typed: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }), usePathname: () => "/home" }));
vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => ({ push: state.push }) }));
vi.mock("@/lib/app-tabs-context", () => ({ useOptionalAppTabSession: () => null }));
vi.mock("@/lib/inbox-launcher", () => ({ openInbox: vi.fn() }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantPanelActions: () => ({ toggle: vi.fn() }) }));
vi.mock("@/lib/sidebar-visibility-context", () => ({ useSidebarVisibility: () => ({ toggle: vi.fn() }) }));
vi.mock("@/lib/scratchpad-context", () => ({ useScratchpad: () => ({ open: vi.fn() }) }));
vi.mock("@/lib/secondary-sidebar-context", () => ({ useSecondarySidebar: () => ({ present: false }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/visible-overlays", () => ({ hasVisibleOpenDialog: () => false, isVisibleOverlay: () => true }));

function Composer() {
  useTypeaheadTarget({ accepts: () => true, type: state.typed });
  return null;
}

let root: Root;
let shortcut: ReturnType<typeof vi.fn<(key: string) => void>>;
const onShortcut = (event: KeyboardEvent) => shortcut(event.key);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  shortcut = vi.fn();
  root = createRoot(document.createElement("div"));
  await act(() => root.render(createElement(KeyboardProvider, null, createElement(Composer))));
  // Single-key shortcuts listen after the provider, as the create shortcuts do.
  window.addEventListener("keydown", onShortcut);
});
afterEach(async () => {
  window.removeEventListener("keydown", onShortcut);
  await act(() => root.unmount());
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function press(key: string) {
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("type-ahead into a Numo composer", () => {
  it("replays a lone key as its shortcut once the window has passed", () => {
    press("c");
    expect(shortcut).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TYPEAHEAD_WINDOW_MS);
    expect(shortcut).toHaveBeenCalledExactlyOnceWith("c");
    expect(state.typed).not.toHaveBeenCalled();
  });

  it("sends a burst to the composer and runs no shortcut", () => {
    press("c");
    press("o");
    vi.advanceTimersByTime(TYPEAHEAD_WINDOW_MS);
    expect(state.typed).toHaveBeenCalledExactlyOnceWith("co");
    expect(shortcut).not.toHaveBeenCalled();
  });

  it("keeps a navigation chord when only two keys follow", () => {
    press("g");
    press("h");
    vi.advanceTimersByTime(TYPEAHEAD_WINDOW_MS);
    expect(state.push).toHaveBeenCalledWith("/home");
    expect(state.typed).not.toHaveBeenCalled();
  });

  it("treats a third key after the chord prefix as text", () => {
    press("g");
    press("o");
    press("o");
    expect(state.typed).toHaveBeenCalledExactlyOnceWith("goo");
    expect(state.push).not.toHaveBeenCalled();
  });

  it("releases the held key before a non-printable key", () => {
    press("c");
    press("Escape");
    expect(shortcut.mock.calls.map(([key]) => key)).toEqual(["c", "Escape"]);
  });
});
