// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

/**
 * The Numo launcher signals an unread answer only for a conversation the user
 * is not watching: not while the panel is open, nor while a page shows the
 * conversation itself (Home, MIN-930).
 */

const panel = vi.hoisted(() => ({ isOpen: false, fabSuppressed: false }));

vi.mock("@/lib/assistant-panel-context", () => ({
  useAssistantPanel: () => panel,
  useAssistantPanelActions: () => ({ toggle: vi.fn(), open: vi.fn() }),
}));
vi.mock("@/lib/assistant-chat-context", () => ({
  useAssistantBusy: () => false,
  useAssistantUnreadAwaitsAnswer: () => false,
  useAssistantUnreadResponseConversationId: () => "conv-1",
}));
vi.mock("@/components/assistant/numo-launcher-icon", () => ({
  NumoLauncherIcon: ({ unread }: { unread: boolean }) => <span data-unread={String(unread)} />,
}));
vi.mock("@/components/new-menu", () => ({ useCreateActions: () => [] }));
vi.mock("@/lib/scratchpad-context", () => ({ useScratchpad: () => ({}) }));
vi.mock("@/lib/use-scratchpad-query", () => ({ useScratchpadProgress: () => null }));
vi.mock("@/lib/keyboard/use-mod-shortcut", () => ({ useModShiftShortcut: () => {} }));

import { MobileNumoButton } from "./mobile-nav-actions";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  panel.isOpen = false;
  panel.fabSuppressed = false;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function unreadShown(): string | null {
  act(() => root.render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MobileNumoButton />
    </NextIntlClientProvider>,
  ));
  return host.querySelector("[data-unread]")!.getAttribute("data-unread");
}

it("marks an unread answer while nobody watches the conversation", () => {
  expect(unreadShown()).toBe("true");
});

it("stays quiet while the panel or Home shows the conversation", () => {
  panel.isOpen = true;
  expect(unreadShown()).toBe("false");
  panel.isOpen = false;
  panel.fabSuppressed = true;
  expect(unreadShown()).toBe("false");
});
