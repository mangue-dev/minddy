// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

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
vi.mock("./auth-context", () => ({ useAuth: () => ({ user: null }), useAuthOptional: () => null }));
vi.mock("./use-attachment-uploads", () => ({ useAttachmentUploads: () => h.uploads }));
vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));
// Load the actual primitives without the package barrel's unrelated emoji data.
vi.mock("@/components/theme-provider", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTheme: () => ({ resolvedTheme: "light" }),
}));

import { ChatInput } from "@/components/assistant/chat-input";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("fetch", h.fetch);
  // The message field fades its overflowing edges, measured by a
  // ResizeObserver; jsdom has none.
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  // cmdk scrolls the active row into view; jsdom has no layout.
  Element.prototype.scrollIntoView = () => {};
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

describe("the composer's + menu", () => {
  it("places an MCP server in the message as a mention instead of ignoring it", async () => {
    const onAddContext = vi.fn();
    await act(async () => {
      root.render(createElement(TooltipProvider, {
        children: createElement(ChatInput, {
          onSend: vi.fn(), hideAttach: true, onAddContext,
          mentionables: [{ type: "mcp", id: "srv-1", label: "Sentry", mcpService: "sentry" }],
        }),
      }));
    });
    const plus = container.querySelector<HTMLButtonElement>('button[aria-label="addFilesOrContext"]')!;
    await act(async () => {
      plus.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
      plus.click();
    });
    const item = [...document.querySelectorAll<HTMLElement>('[cmdk-item]')]
      .find((node) => node.textContent?.includes("Sentry"))!;
    expect(item).toBeTruthy();
    await act(async () => item.click());

    const pill = container.querySelector<HTMLElement>('[contenteditable="true"] [data-mention-type="mcp"]');
    expect(pill?.dataset.mentionId).toBe("srv-1");
    expect(onAddContext).not.toHaveBeenCalled();
  });
});

describe("a draft written by another composer", () => {
  it("does not take the caret from the field the user is typing in", async () => {
    const other = document.createElement("input");
    document.body.append(other);
    const draft = (draftHtml: string) => createElement(TooltipProvider, {
      children: createElement(ChatInput, {
        onSend: vi.fn(), hideAttach: true, restoreCaretAtEnd: true, draftHtml,
      }),
    });
    await act(async () => root.render(draft("")));
    other.focus();

    await act(async () => root.render(draft("Written in the panel")));
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    expect(container.querySelector('[contenteditable="true"]')?.textContent).toBe("Written in the panel");
    expect(document.activeElement).toBe(other);
    other.remove();
  });
});
