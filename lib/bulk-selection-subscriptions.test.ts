// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssistantPanelProvider, useAssistantPanel, useAssistantPanelActions,
  type AssistantPanelActions, type AssistantPanelContextValue,
} from "./assistant-panel-context";
import { useBulkSelectionActions } from "./use-bulk-selection-actions";
import type { Issue } from "./types";

const chord = vi.hoisted(() => ({ current: null as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/all" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("mangue-ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/keyboard/keyboard-context", () => ({
  useChordPrefixForEvents: () => chord,
  isTypingTarget: (target: HTMLElement) => target?.tagName === "INPUT",
}));
vi.mock("@/lib/agent-api", () => ({ handOffIssueApi: vi.fn() }));
afterEach(() => { chord.current = null; vi.unstubAllGlobals(); });

describe("bulk action subscriptions", () => {
  it("keeps board actions asleep during assistant updates and preserves selected keyboard actions", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const issue = { id: "issue", project_id: "project", number: 1, title: "Selected issue" } as Issue;
    let actions: AssistantPanelActions;
    let panel: AssistantPanelContextValue;
    const renderBoard = vi.fn();
    function Board() {
      renderBoard();
      useBulkSelectionActions({ selectedIssues: [issue], projectId: "project",
        identifierOf: () => "PERF-1", buildInput: () => ({ issue, projectId: "project", projectKey: "PERF" }) });
      return null;
    }
    function Panel() { actions = useAssistantPanelActions(); panel = useAssistantPanel(); return null; }
    const children = [createElement(Board, { key: "board" }), createElement(Panel, { key: "panel" })];
    const root = createRoot(document.createElement("div"));
    try {
      await act(() => root.render(createElement(AssistantPanelProvider, null, ...children)));
      expect(renderBoard).toHaveBeenCalledTimes(1);
      await act(() => actions.setAmbientContext({ issueId: "other" }, "other"));
      expect(renderBoard).toHaveBeenCalledTimes(1);
      chord.current = "g";
      await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", shiftKey: true })));
      expect(panel!.isOpen).toBe(false);
      chord.current = null;
      await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", shiftKey: true })));
      expect(panel!.isOpen).toBe(true);
      expect(panel!.pendingOptions).toMatchObject({ projectId: "project" });
      expect(renderBoard).toHaveBeenCalledTimes(1);
    } finally { await act(() => root.unmount()); }
  });
});
