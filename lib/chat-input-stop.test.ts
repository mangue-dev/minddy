// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "mangue-ui";

const h = vi.hoisted(() => ({
  uploads: {
    pending: [], inputs: [], uploading: false,
    addFiles: vi.fn(), remove: vi.fn(), clear: vi.fn(),
  },
  fetch: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("./auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("./use-attachment-uploads", () => ({ useAttachmentUploads: () => h.uploads }));
vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));
// Load the actual primitives without the package barrel's unrelated emoji data.
vi.mock("mangue-ui", async () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
  ...await import("mangue-ui/components/ui/button"),
  ...await import("mangue-ui/components/ui/tooltip"),
  ...await import("mangue-ui/components/ui/popover"),
  ...await import("mangue-ui/components/ui/command"),
  ...await import("mangue-ui/components/ui/send-button-with-cost"),
  ...await import("mangue-ui/lib/utils"),
}));

import { ChatInput } from "@/components/assistant/chat-input";
import { useAssistantChat } from "./use-assistant-chat";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("fetch", h.fetch);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function render(onAbort: () => void, sendWhileStreaming: boolean, draftHtml = "") {
  await act(async () => {
    root.render(createElement(TooltipProvider, {
      children: createElement(ChatInput, {
        onSend: vi.fn(), onAbort, isStreaming: true, sendWhileStreaming,
        hideAttach: true, draftHtml,
      }),
    }));
  });
}

describe("shared chat composer Stop button", () => {
  it("sends the durable Stop request from the real composer click while a tool is executing", async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    let chat!: ReturnType<typeof useAssistantChat>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; },
    });
    h.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/assistant/chat") return new Response(stream, {
        headers: { "X-Numo-Conversation-Id": "51700000-0000-4000-8000-000000000001" },
      });
      if (url === "/api/assistant/turns/stop") return Response.json({ status: "stopped" });
      if (url.includes("/status")) return Response.json({ status: "stopped", activity: [] });
      if (url.includes("/messages")) return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    function Harness() {
      chat = useAssistantChat();
      const busy = ["streaming", "executing_tool", "generating_server"].includes(chat.state.status);
      return createElement(TooltipProvider, {
        children: createElement(ChatInput, {
          hideAttach: true, isStreaming: busy, onAbort: chat.abort,
          onSend: (message: string) => { void chat.sendMessage(null, message); },
        }),
      });
    }
    await act(async () => root.render(createElement(Harness)));
    const editor = container.querySelector<HTMLElement>('[contenteditable="true"]')!;
    await act(async () => {
      editor.textContent = "List my projects and issues";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await act(async () => editor.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", ctrlKey: true, bubbles: true,
    })));
    await act(async () => streamController.enqueue(new TextEncoder().encode(
      'event: tool_call_start\ndata: {"id":"call-1","name":"list_projects"}\n\n',
    )));
    expect(chat.state.status).toBe("executing_tool");
    const stop = container.querySelector<HTMLButtonElement>('button[aria-label="stop"]')!;
    await act(async () => stop.click());
    expect(h.fetch.mock.calls.filter(([url]) => url === "/api/assistant/turns/stop")).toHaveLength(1);
    expect(chat.state.status).toBe("idle");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => {
      streamController.enqueue(new TextEncoder().encode(
        'event: content_delta\ndata: {"delta":"late final answer"}\n\n'
        + 'event: done\ndata: {"status":"stopped"}\n\n',
      ));
      streamController.close();
    });
    expect(chat.state.status).toBe("idle");
    expect(chat.state.streamingContent).toBe("");
  });

  it("calls the supplied abort handler on the first click during an assistant tool round", async () => {
    const onAbort = vi.fn();
    await render(onAbort, false, "A draft retained while Numo is working");
    const stop = container.querySelector<HTMLButtonElement>('button[aria-label="stop"]');
    expect(stop).not.toBeNull();
    await act(async () => stop!.click());
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[contenteditable]')?.textContent).toBe("A draft retained while Numo is working");
  });

  it("stops an agent on the first click while its steering composer is empty", async () => {
    const onAbort = vi.fn();
    await render(onAbort, true);
    const stop = container.querySelector<HTMLButtonElement>('button[aria-label="stop"]');
    expect(stop).not.toBeNull();
    await act(async () => stop!.click());
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("keeps the send action available for a worker steering draft", async () => {
    const onAbort = vi.fn();
    await render(onAbort, true, "Steer the running worker");
    expect(container.querySelector('button[aria-label="stop"]')).toBeNull();
    expect(container.querySelector('[contenteditable]')?.textContent).toBe("Steer the running worker");
    expect(onAbort).not.toHaveBeenCalled();
  });
});
