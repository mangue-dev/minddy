// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { AgentEngineBadge } from "./agent-engine-badge";

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

async function render(engine: unknown) {
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}>
    <AgentEngineBadge engine={engine} />
  </NextIntlClientProvider>));
}

it.each([
  ["codex", "Codex", "codex"],
  ["claude_code", "Claude Code", "claude"],
  ["opencode", "OpenCode", "opencode"],
])("renders the frozen %s harness with its actual brand mark", async (engine, name, logo) => {
  await render(engine);
  expect(host.textContent).toContain(name);
  expect(host.querySelector("[data-agent-logo]")?.getAttribute("data-agent-logo")).toBe(logo);
  expect(host.textContent?.includes(messages.NativeAgentConnections.experimental)).toBe(engine === "claude_code");
  const tooltip = host.querySelector('[role="tooltip"]');
  if (engine === "opencode") expect(tooltip).toBeNull();
  else expect(tooltip?.textContent).toBe(`The model and reasoning are managed by ${name}.`);
});

it.each(["loop", null, undefined, "future_harness"])("keeps historical or missing %s identity generic", async (engine) => {
  await render(engine);
  expect(host.textContent).toBe("Code agent");
  expect(host.querySelector("[data-agent-logo]")?.getAttribute("data-agent-logo")).toBe("null");
  expect(host.querySelector('[role="tooltip"]')).toBeNull();
});
