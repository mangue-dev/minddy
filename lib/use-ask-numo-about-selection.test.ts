// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  AssistantPanelProvider,
  useAssistantPanel,
  useAssistantPanelActions,
  type AssistantPanelActions,
  type AssistantPanelContextValue,
} from "./assistant-panel-context";
import { useAskNumoAboutSelection } from "./use-ask-numo-about-selection";

const runtime = vi.hoisted(() => ({ managed: true }));
vi.mock("next/navigation", () => ({ usePathname: () => "/projects/p1/pages/page-1" }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/runtime-config-provider", () => ({
  useOptionalRuntimeConfig: () => ({
    capabilities: { managedAi: { configured: runtime.managed } },
  }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  runtime.managed = true;
});

type Ask = ReturnType<typeof useAskNumoAboutSelection>;

async function mount(children: React.ReactNode[]) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  await act(() => root.render(children));
  return root;
}

describe("useAskNumoAboutSelection", () => {
  it("offers nothing on a surface without the assistant panel", async () => {
    let ask: Ask | undefined;
    function Toolbar() {
      ask = useAskNumoAboutSelection();
      return null;
    }
    const root = await mount([createElement(Toolbar, { key: "toolbar" })]);
    try {
      expect(ask).toBeNull();
    } finally {
      await act(() => root.unmount());
    }
  });

  it("offers nothing when this account has no AI for Numo", async () => {
    runtime.managed = false;
    let ask: Ask | undefined;
    function Toolbar() {
      ask = useAskNumoAboutSelection();
      return null;
    }
    const root = await mount([
      createElement(AssistantPanelProvider, { key: "provider", children: createElement(Toolbar) }),
    ]);
    try {
      // Signed out of the auth context: no key can serve the assistant.
      expect(ask).toBeNull();
    } finally {
      await act(() => root.unmount());
    }
  });

  it("opens the composer on the ambient context plus the quote, without sending", async () => {
    let ask: Ask | undefined;
    let actions: AssistantPanelActions | undefined;
    const states: AssistantPanelContextValue[] = [];
    function Toolbar() {
      ask = useAskNumoAboutSelection();
      actions = useAssistantPanelActions();
      states.push(useAssistantPanel());
      return null;
    }
    const root = await mount([
      createElement(AssistantPanelProvider, { key: "provider", children: createElement(Toolbar) }),
    ]);
    try {
      await act(() => actions!.setAmbientContext(
        { projectId: "p1", pageId: "page-1", pageTitle: "Spec" }, "page"));
      await act(() => ask!({ text: "  A selected passage  " }));

      const state = states.at(-1)!;
      expect(state.isOpen).toBe(true);
      expect(state.activePageContext).toEqual({
        projectId: "p1",
        pageId: "page-1",
        pageTitle: "Spec",
        selection: { text: "A selected passage" },
      });
      expect(state.pendingOptions).toMatchObject({
        focusComposer: true,
        intent: { source: "page", action: "discuss" },
      });
      expect(state.pendingOptions?.prompt).toBeUndefined();

      // Removing the pill (or sending) keeps the page and drops the quote.
      await act(() => actions!.clearSelectionContext());
      expect(states.at(-1)!.activePageContext).toEqual({
        projectId: "p1",
        pageId: "page-1",
        pageTitle: "Spec",
      });
    } finally {
      await act(() => root.unmount());
    }
  });
});
