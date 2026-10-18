// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { BulkActionsProvider, useBulkActions } from "./bulk-actions-context";

describe("selection actions shortcut", () => {
  it("opens the registered selection's actions, and nothing once it is gone", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let api: ReturnType<typeof useBulkActions> | null = null;
    function Probe() {
      api = useBulkActions();
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<BulkActionsProvider><Probe /></BulkActionsProvider>));
    expect(api!.openSelectionActions()).toBe(false);
    const open = vi.fn();
    api!.registerSelectionActions(open);
    expect(api!.openSelectionActions()).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    api!.registerSelectionActions(null);
    expect(api!.openSelectionActions()).toBe(false);
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });
});
