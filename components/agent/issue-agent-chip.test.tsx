// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { IssueAgentChip } from "./issue-agent-chip";

vi.mock("mangue-ui", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("@/components/mcp-agent-logo", () => ({
  McpAgentLogo: ({ agent }: { agent: unknown }) => <i data-agent-logo={String(agent)} />,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span role="tooltip">{children}</span>,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it.each([
  ["codex", "Codex", "codex"],
  ["claude_code", "Claude Code", "claude"],
  ["opencode", "OpenCode", "opencode"],
  [undefined, "Code agent", "null"],
])("identifies working %s and opens its conversation", async (engine, name, logo) => {
  const onOpenConversation = vi.fn();
  const onOpenPr = vi.fn();
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}>
    <IssueAgentChip working engine={engine} pr={null}
      onOpenConversation={onOpenConversation} onOpenPr={onOpenPr} />
  </NextIntlClientProvider>));
  const button = host.querySelector("button")!;
  expect(button.getAttribute("aria-label")).toBe(`${name} is working…`);
  expect(host.querySelector("[data-agent-logo]")?.getAttribute("data-agent-logo")).toBe(logo);
  expect(host.querySelector('[role="tooltip"]')?.textContent).toBe(`${name} is working…`);
  await act(() => button.click());
  expect(onOpenConversation).toHaveBeenCalledOnce();
  expect(onOpenPr).not.toHaveBeenCalled();
});

it("keeps an idle issue without a pull request silent", async () => {
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}>
    <IssueAgentChip working={false} engine="codex" pr={null}
      onOpenConversation={() => {}} onOpenPr={() => {}} />
  </NextIntlClientProvider>));
  expect(host.innerHTML).toBe("");
});
