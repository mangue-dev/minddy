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

vi.mock("next/navigation", () => ({ usePathname: () => "/all" }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe("assistant panel action subscriptions", () => {
  it("does not rerender board actions when an issue changes the ambient context", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const renderAction = vi.fn();
    const actions: AssistantPanelActions[] = [];
    const states: AssistantPanelContextValue[] = [];
    function CardActions() {
      const current = useAssistantPanelActions();
      renderAction();
      actions.push(current);
      return null;
    }
    function PanelState() {
      states.push(useAssistantPanel());
      return null;
    }
    const cards = Array.from({ length: 600 }, (_, index) =>
      createElement(CardActions, { key: index }));
    const root = createRoot(document.createElement("div"));
    try {
      await act(() => root.render(createElement(AssistantPanelProvider, null,
        ...cards, createElement(PanelState))));
      expect(renderAction).toHaveBeenCalledTimes(600);
      const initialActions = actions[0];
      await act(() => initialActions.setAmbientContext(
        { projectId: "project-1", issueId: "issue-1" }, "issue-panel"));
      expect(states.at(-1)?.ambientContext?.issueId).toBe("issue-1");
      expect(renderAction).toHaveBeenCalledTimes(600);

      await act(() => initialActions.open({ conversationId: "conversation-1" }));
      expect(states.at(-1)).toMatchObject({
        isOpen: true,
        pendingOptions: { conversationId: "conversation-1" },
      });
      await act(() => initialActions.toggle());
      expect(states.at(-1)?.isOpen).toBe(false);
      await act(() => initialActions.toggle());
      expect(states.at(-1)).toMatchObject({ isOpen: true, pendingOptions: null });
      expect(renderAction).toHaveBeenCalledTimes(600);
      expect(actions.every((value) => value === initialActions)).toBe(true);
    } finally {
      await act(() => root.unmount());
    }
  });
});
