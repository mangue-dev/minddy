// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { DocumentationNumo } from "./documentation-numo";
import { SELF_HOSTING_OVERVIEW } from "@/lib/self-hosting-help-context";

const h = vi.hoisted(() => ({ sendMessage: vi.fn(), reset: vi.fn() }));
vi.mock("mangue-ui", async () => ({
  ...await import("mangue-ui/components/ui/button"),
  ...await import("mangue-ui/components/ui/textarea"),
  ...await import("mangue-ui/components/ui/sheet"),
  ...await import("mangue-ui/components/ui/spinner"),
  SendButtonWithCost: ({ disabled, onClick, ariaLabel }: { disabled: boolean; onClick: () => void; ariaLabel: string }) => <button type="button" disabled={disabled} onClick={onClick} aria-label={ariaLabel} />,
}));
vi.mock("@/components/ai-elements/message", () => ({ Message: () => null, MessageContent: () => null }));
vi.mock("./documentation-help-links", () => ({ DocumentationHelpResponse: () => null }));
vi.mock("@/components/assistant/usage-exhausted-card", () => ({ NumoUsageExhaustedCard: () => null, parseNumoUsageExhausted: () => null }));
vi.mock("@/lib/use-assistant-chat", () => ({ useAssistantChat: () => ({
  state: { status: "idle", messages: [], streamingContent: "", error: null }, sendMessage: h.sendMessage,
  reset: h.reset, retry: vi.fn(), abort: vi.fn(),
}) }));
vi.mock("@/lib/runtime-config-provider", () => ({ useRuntimeConfig: () => ({ appUrl: "http://localhost" }) }));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => false, useMobileViewport: () => {} }));
vi.mock("@/components/agent-beam", () => ({ AgentBeam: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));
vi.mock("@/components/ui/app-tooltip", () => ({ AppTooltip: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/scroll-fade-edges", () => ({ ScrollFadeEdges: () => null }));
vi.mock("@/lib/use-scroll-fade", () => ({ useScrollFade: () => ({ ref: undefined, scrollProps: {}, edges: {} }) }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let authenticated = false;
const wizard = { ...SELF_HOSTING_OVERVIEW, stepId: "route" as const, path: "local" as const };
function render() {
  act(() => root.render(<NextIntlClientProvider locale="en" messages={en}>
    <DocumentationNumo open onClose={vi.fn()} articleId="installation" sections={[]} locale="en" authenticated={authenticated} wizard={wizard} />
  </NextIntlClientProvider>));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  authenticated = false;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("opens guest help with a sign-in banner and blocks input and submission", () => {
  render();
  const input = host.querySelector("textarea")!;
  expect(input.disabled).toBe(true);
  expect(input.getAttribute("aria-describedby")).toBe("documentation-numo-sign-in");
  expect(host.querySelector('[role="status"]')?.textContent).toContain(en.Documentation.numoSignInRequired);
  act(() => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(h.sendMessage).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="Send"]')?.disabled).toBe(true);
});

it("enables the composer after sign-in and sends the current wizard context", () => {
  render(); authenticated = true; render();
  const input = host.querySelector("textarea")!;
  expect(input.disabled).toBe(false);
  expect(host.querySelector("#documentation-numo-sign-in")).toBeNull();
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "How do I use this step?");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(h.sendMessage).toHaveBeenCalledWith(null, "How do I use this step?", { pageContext: { documentation: { articleId: "install-locally", locale: "en", selfHosting: wizard } } });
});
