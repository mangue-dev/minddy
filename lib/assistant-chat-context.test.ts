// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantChatContextValue } from "./assistant-chat-context";
import type { OpenAssistantOptions } from "./assistant-panel-context";

const h = vi.hoisted(() => ({
  panel: { isOpen: true, pendingOptions: null as OpenAssistantOptions | null, routeProjectId: "a" as string | null, close: vi.fn() },
  state: {
    conversationId: "conversation",
    conversationProjectId: "a",
    messages: [{ role: "user", content: "Earlier message" }],
    status: "idle",
    routineOccurrence: null as {
      id: string;
      routine_id: string;
      origin: "scheduled" | "manual";
      scheduled_for: string | null;
      created_at: string;
    } | null,
  },
  load: vi.fn(), reset: vi.fn(), send: vi.fn(), abort: vi.fn(), active: vi.fn(), pointer: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
  chatOptions: null as { onToolResult?: (name: string, success: boolean, result: unknown) => void } | null,
  router: { push: vi.fn(), refresh: vi.fn() },
  theme: { setTheme: vi.fn() }, auth: { refreshUser: vi.fn() },
}));
vi.mock("./assistant-panel-context", () => ({ useAssistantPanel: () => h.panel }));
vi.mock("./use-assistant-chat", () => ({ useAssistantChat: (options: { onToolResult?: (name: string, success: boolean, result: unknown) => void }) => { h.chatOptions = options; return { state: h.state, loadConversation: h.load, reset: h.reset, sendMessage: h.send, abort: h.abort }; } }));
vi.mock("./assistant-api", () => ({ fetchActiveConversation: h.active, setActiveConversation: h.pointer, updateConversation: async () => true }));
vi.mock("./use-agent-runs", () => ({ allAgentSessionsQueryKey: ["agent-sessions", "all"] as const }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => h.queryClient }));
vi.mock("./auth-context", () => ({ useAuth: () => h.auth }));
vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("next/navigation", () => ({ useRouter: () => h.router }));
vi.mock("mangue-ui/components/theme-provider", () => ({ useTheme: () => h.theme }));
vi.mock("./set-locale", () => ({ setLocaleCookie: async () => {} }));
import { AssistantChatProvider, useAssistantChatContext } from "./assistant-chat-context";

let root: Root;
let value: AssistantChatContextValue;
function Probe() { value = useAssistantChatContext(); return null; }
async function render(show = true) {
  await act(async () => root.render(createElement(AssistantChatProvider, { children: show ? createElement(Probe) : null })));
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  h.panel = { ...h.panel, isOpen: true, pendingOptions: null, routeProjectId: "a" };
  h.state = { ...h.state, status: "idle", routineOccurrence: null };
  h.active.mockResolvedValue({ conversationId: "conversation", projectId: "a" });
  root = createRoot(document.createElement("div"));
});
afterEach(() => { act(() => root.unmount()); });

describe("persistent conversation context", () => {
  it("lets the full page request the same lazy restore while the panel is closed", async () => {
    h.panel.isOpen = false;
    await render();
    expect(h.active).not.toHaveBeenCalled();

    await act(async () => value.requestRestore());

    expect(h.active).toHaveBeenCalledOnce();
    expect(h.load).toHaveBeenCalledWith("conversation", "a");
  });

  it("keeps history and removable pins across navigation, panel unmounts and an active response", async () => {
    await render();
    await act(async () => value.setPinned([{ kind: "project", id: "a", label: "A" }]));
    h.state = { ...h.state, status: "streaming" };
    h.panel = { ...h.panel, routeProjectId: "b", pendingOptions: { projectId: "b" } };
    await render();
    expect(value.scopeProjectId).toBe("b");
    expect(value.isBusy).toBe(true);
    expect(value.state.conversationId).toBe("conversation");
    expect(value.state.messages).toHaveLength(1);
    await render(false);
    await render();
    expect(value.pinned).toEqual([{ kind: "project", id: "a", label: "A" }]);
    expect(h.reset).not.toHaveBeenCalled();
    expect(h.abort).not.toHaveBeenCalled();
    await act(async () => value.setPinned([]));
    expect(value.pinned).toEqual([]);
  });
  it("restores the existing conversation before a contextual opening, even if closed while loading", async () => {
    let resolve!: (value: unknown) => void;
    h.active.mockReturnValue(new Promise((done) => { resolve = done; }));
    h.panel.pendingOptions = { projectId: "b", prompt: "Discuss B" };
    await render();
    expect(value.restoring).toBe(true);
    h.panel = { ...h.panel, isOpen: false };
    await render();
    await act(async () => resolve({ conversationId: "conversation", projectId: "a" }));
    h.panel = { ...h.panel, isOpen: true };
    await render();
    expect(h.load).toHaveBeenCalledWith("conversation", "a");
    expect(value.restoring).toBe(false);
    expect(value.scopeProjectId).toBe("b");
    expect(h.reset).not.toHaveBeenCalled();
  });

  it("keeps routine-owned conversations out of the active Numo pointer", async () => {
    h.state = {
      ...h.state,
      routineOccurrence: {
        id: "occurrence",
        routine_id: "routine",
        origin: "scheduled",
        scheduled_for: "2026-09-13T08:00:00.000Z",
        created_at: "2026-09-13T08:00:00.000Z",
      },
    };

    await render();

    expect(h.pointer).toHaveBeenLastCalledWith(null);
  });

  /**
   * A delegation launched mid-turn must light the FAB border and the sidebar
   * spinner at once: the sessions list rests (no poll) and only an
   * invalidation sees a run that just started.
   */
  it("invalidates the agent sessions on a delegation tool result", async () => {
    await render();
    expect(h.chatOptions).not.toBeNull();

    await act(async () => h.chatOptions?.onToolResult?.("launch_code_agent", true, { run_id: "run" }));
    expect(h.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["agent-sessions", "all"] });

    await act(async () => h.chatOptions?.onToolResult?.("launch_code_agent", false, {}));
    expect(h.queryClient.invalidateQueries).toHaveBeenCalledOnce();
  });
});
