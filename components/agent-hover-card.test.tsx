// @vitest-environment jsdom
//
// An MCP agent's card in an activity log (MIN-879): the agent, then the
// person whose key it used.
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { MentionHoverProvider } from "@/components/mention-hover";
import { AgentHoverCard } from "./agent-hover-card";

vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/components/mcp-agent-logo", () => ({ McpAgentLogo: () => null }));

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function render(inApp: boolean) {
  const card = createElement(AgentHoverCard, {
    agent: "claude-code",
    name: "Claude Code",
    owner: { name: "Camille Roy", avatarSeed: "seed" },
    children: createElement("button", { type: "button" }, "Claude Code"),
  });
  const tree: ReactNode = inApp
    ? createElement(MentionHoverProvider, { card: ({ children }) => children, children: card })
    : card;
  await act(async () => {
    root.render(createElement(NextIntlClientProvider, { locale: "en", messages, timeZone: "UTC", children: tree }));
  });
}

it("names the agent and the person whose key it used", async () => {
  await render(true);
  vi.useFakeTimers();
  try {
    await act(async () => {
      host.querySelector("button")!.focus();
      vi.advanceTimersByTime(500);
    });
  } finally {
    vi.useRealTimers();
  }
  const card = document.querySelector("[data-slot=hover-card-content]");
  expect(card?.textContent).toBe("Claude CodeMCPCamille Roy");
});

it("shows nothing more outside the signed-in app", async () => {
  await render(false);
  expect(host.innerHTML).toBe('<button type="button">Claude Code</button>');
});
