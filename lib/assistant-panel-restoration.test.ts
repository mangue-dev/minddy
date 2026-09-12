// @vitest-environment jsdom
import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenAssistantOptions } from "./assistant-panel-context";

const h = vi.hoisted(() => ({
  pending: null as OpenAssistantOptions | null,
  close: vi.fn(), clear: vi.fn(), active: vi.fn(), pointer: vi.fn(),
  send: vi.fn(), fill: vi.fn(), load: vi.fn(), reset: vi.fn(), abort: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
  theme: { setTheme: vi.fn() }, auth: { refreshUser: vi.fn() },
  state: { conversationId: null, conversationProjectId: null, messages: [], status: "idle" },
  projects: [],
}));
vi.mock("./assistant-panel-context", () => ({ useAssistantPanel: () => ({
  isOpen: true, routeProjectId: null, pendingOptions: h.pending,
  activePageContext: null, ambientContext: null, close: h.close, clearPendingOptions: h.clear,
}) }));
vi.mock("./use-assistant-chat", () => ({ useAssistantChat: () => ({
  state: h.state, loadConversation: h.load, reset: h.reset, sendMessage: h.send, abort: h.abort,
}) }));
vi.mock("./assistant-api", () => ({
  fetchActiveConversation: h.active, setActiveConversation: h.pointer,
  updateConversation: async () => true,
}));
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
  const { forwardRef, useImperativeHandle, useState, createElement: element } = await import("react");
  return { AssistantShell: forwardRef(function Shell(_props, ref) {
    const [draft, setDraft] = useState("");
    useImperativeHandle(ref, () => ({
      sendMessage: h.send,
      fill: (text: string) => { h.fill(text); setDraft(text); },
    }), []);
    return element("span", { "data-draft": true }, draft);
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
  h.clear.mockImplementation(() => { h.pending = null; });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

const work = { conversationId: "work", projectId: "a", detailHref: "/agents/work" };
describe("contextual openings while restoring work", () => {
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
    expect(h.load).not.toHaveBeenCalled();
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

  it("still follows the work detail for a plain resume", async () => {
    h.active.mockResolvedValue(work);
    await render();
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.router.push).toHaveBeenCalledExactlyOnceWith(work.detailHref);
    expect(h.pointer).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
});
