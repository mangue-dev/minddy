// @vitest-environment jsdom
import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenAssistantOptions } from "./assistant-panel-context";

const h = vi.hoisted(() => ({
  pending: null as OpenAssistantOptions | null,
  isOpen: true,
  read: vi.fn(),
  close: vi.fn(), clear: vi.fn(), active: vi.fn(), pointer: vi.fn(),
  send: vi.fn(), fill: vi.fn(), load: vi.fn(), reset: vi.fn(), abort: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
  theme: { setTheme: vi.fn() }, auth: { refreshUser: vi.fn() },
  state: { conversationId: null as string | null, conversationProjectId: null, messages: [], status: "idle", completedResponse: null as { conversationId: string; messageId: string } | null },
  projects: [],
}));
vi.mock("./assistant-panel-context", () => ({ useAssistantPanel: () => ({
  isOpen: h.isOpen, routeProjectId: null, pendingOptions: h.pending,
  activePageContext: null, ambientContext: null, close: h.close, clearPendingOptions: h.clear,
}) }));
vi.mock("./use-assistant-chat", () => ({ useAssistantChat: () => ({
  state: h.state, loadConversation: h.load, reset: h.reset, sendMessage: h.send, abort: h.abort,
}) }));
vi.mock("./assistant-api", () => ({
  fetchActiveConversation: h.active, setActiveConversation: h.pointer,
  updateConversation: h.read,
}));
vi.mock("./use-agent-runs", () => ({ allAgentSessionsQueryKey: ["agent-sessions", "all"] as const }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("./auth-context", () => ({ useAuth: () => h.auth }));
vi.mock("./projects-context", () => ({ useProjects: () => ({ projects: h.projects }) }));
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useRouter: () => h.router }));
vi.mock("mangue-ui/components/theme-provider", () => ({ useTheme: () => h.theme }));
vi.mock("./set-locale", () => ({ setLocaleCookie: async () => {} }));
vi.mock("mangue-ui", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) => open ? children : null,
  SheetContent: ({ children }: { children: ReactNode }) => children,
  SheetTitle: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/assistant/assistant-shell", async () => {
  const { forwardRef, useImperativeHandle, useState, useEffect, createElement: element } = await import("react");
  const { useAssistantChatContext, useAssistantUnreadResponseConversationId } = await import("./assistant-chat-context");
  return { AssistantShell: forwardRef(function Shell({ visible }: { visible?: boolean }, ref) {
    const [draft, setDraft] = useState("");
    const { state, restoring, requestRestore, markResponseRead } = useAssistantChatContext();
    const unreadConversationId = useAssistantUnreadResponseConversationId();
    // The real shell asks for the lazy restore on mount — the provider no
    // longer restores as a side effect of the panel opening.
    useEffect(() => { requestRestore(); }, [requestRestore]);
    useEffect(() => {
      if (visible && !restoring && state.status === "idle" && state.conversationId) {
        markResponseRead(state.conversationId);
      }
    }, [visible, restoring, state.status, state.conversationId, markResponseRead]);
    useImperativeHandle(ref, () => ({
      sendMessage: h.send,
      fill: (text: string) => { h.fill(text); setDraft(text); },
    }), []);
    return element("span", { "data-draft": true, "data-visible": !!visible, "data-unread": unreadConversationId }, draft);
  }) };
});
import { AssistantChatProvider } from "./assistant-chat-context";
import { AssistantPanel } from "@/components/assistant-panel";

let root: Root;
let container: HTMLDivElement;
async function render() {
  await act(async () => root.render(createElement(AssistantChatProvider, {
    children: createElement(Fragment, null, createElement(AssistantPanel)),
  })));
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  h.pending = null;
  h.isOpen = true;
  h.state = { ...h.state, conversationId: null, completedResponse: null, status: "idle" };
  h.read.mockResolvedValue(true);
  h.clear.mockImplementation(() => { h.pending = null; });
  // Loading a conversation installs it as the live thread (the real
  // LOAD_HISTORY dispatch): the pointer mirror then sees it as already read.
  h.load.mockImplementation(async (conversationId: string) => {
    h.state = { ...h.state, conversationId };
  });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

const work = { conversationId: "work", projectId: "a" };
describe("contextual openings while restoring work", () => {
  it("keeps the old response unread after opening options clear until the requested thread loads", async () => {
    h.state = { ...h.state, conversationId: "original", completedResponse: { conversationId: "original", messageId: "answer" } };
    h.active.mockResolvedValue({ conversationId: null, projectId: null });
    h.pending = { conversationId: "requested" };
    let finishLoad!: () => void;
    h.load.mockImplementation(() => new Promise<void>((resolve) => {
      finishLoad = () => {
        h.state = { ...h.state, conversationId: "requested", completedResponse: null };
        resolve();
      };
    }));
    await render();
    expect(h.load).toHaveBeenCalledExactlyOnceWith("requested", null);
    expect(h.pending).toBeNull();
    // The options have been consumed, but the old thread is still in live state.
    await render();
    expect(container.querySelector("[data-draft]")?.getAttribute("data-visible")).toBe("false");
    expect(container.querySelector("[data-draft]")?.getAttribute("data-unread")).toBe("original");
    expect(h.read).not.toHaveBeenCalledWith("original", { read: true });

    await act(async () => finishLoad());
    await render();
    expect(container.querySelector("[data-draft]")?.getAttribute("data-visible")).toBe("true");
    expect(container.querySelector("[data-draft]")?.getAttribute("data-unread")).toBe("original");
    expect(h.read).not.toHaveBeenCalledWith("original", { read: true });

    // Once the requested thread arrives, ordinary history selection is visible.
    h.state = { ...h.state, conversationId: "original" };
    await render();
    expect(container.querySelector("[data-draft]")?.getAttribute("data-visible")).toBe("true");
    expect(h.read).toHaveBeenCalledWith("original", { read: true });
    expect(container.querySelector("[data-draft]")?.hasAttribute("data-unread")).toBe(false);
  });

  it("releases the requested-thread guard when the panel closes during a load", async () => {
    h.state = { ...h.state, conversationId: "original" };
    h.active.mockResolvedValue({ conversationId: null, projectId: null });
    h.pending = { conversationId: "requested" };
    h.load.mockImplementation(() => new Promise<void>(() => {}));
    await render();
    await render();
    expect(container.querySelector("[data-draft]")?.getAttribute("data-visible")).toBe("false");
    h.isOpen = false;
    await render();
    h.isOpen = true;
    await render();
    expect(container.querySelector("[data-draft]")?.getAttribute("data-visible")).toBe("true");
  });

  it.each([
    { kind: "prompt", late: false }, { kind: "draft", late: false },
    { kind: "prompt", late: true }, { kind: "draft", late: true },
  ] as const)("delivers $kind once when it arrives late=$late", async ({ kind, late }) => {
    let resolve!: (value: typeof work) => void;
    h.active.mockReturnValue(new Promise((done) => { resolve = done; }));
    const options: OpenAssistantOptions = {
      [kind]: "Discuss B", projectId: "b", pageContext: { projectId: "b" },
    };
    if (!late) h.pending = options;
    await render();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.fill).not.toHaveBeenCalled();
    if (late) { h.pending = options; await render(); }
    await act(async () => resolve(work));
    // Consume the cleared opening options on the next render too.
    await render();
    expect(h.close).not.toHaveBeenCalled();
    expect(h.router.push).not.toHaveBeenCalled();
    // The resume loads the remembered thread first (a queued prompt or draft
    // continues it); the opening dispatches once, after the restore settles.
    expect(h.load).toHaveBeenCalledExactlyOnceWith(work.conversationId, work.projectId);
    expect(h.pointer).not.toHaveBeenCalled();
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(h.pending).toBeNull();
    if (kind === "prompt") {
      expect(h.send).toHaveBeenCalledExactlyOnceWith("b", "Discuss B", expect.objectContaining({ pageContext: { projectId: "b" } }));
      expect(h.fill).not.toHaveBeenCalled();
    } else {
      expect(h.fill).toHaveBeenCalledExactlyOnceWith("Discuss B");
      expect(container.querySelector("[data-draft]")?.textContent).toBe("Discuss B");
      expect(h.send).not.toHaveBeenCalled();
    }
  });

  it("reopens the remembered conversation in the panel on a plain resume", async () => {
    h.active.mockResolvedValue(work);
    await render();
    expect(h.close).not.toHaveBeenCalled();
    expect(h.router.push).not.toHaveBeenCalled();
    expect(h.load).toHaveBeenCalledExactlyOnceWith(work.conversationId, work.projectId);
    expect(h.pointer).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
});
