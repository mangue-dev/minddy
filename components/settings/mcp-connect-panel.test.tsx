// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { McpConnectPanel } from "./mcp-connect-panel";

const h = vi.hoisted(() => ({
  grants: [] as { agent: string | null }[],
  poll: vi.fn(),
}));
vi.mock("@/lib/use-oauth-grants-query", () => ({
  useOAuthGrantsQuery: (options: { refetchInterval?: number | false }) => {
    h.poll(options.refetchInterval);
    return { grants: h.grants, loading: false };
  },
}));
vi.mock("@/components/mcp-agent-logo", () => ({ McpAgentLogo: () => null }));
// Steps swap at once: the exit animation of `mode="wait"` never ends in jsdom.
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui/tooltip", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  h.grants = [];
  h.poll.mockReset();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const heading = () => document.body.querySelector('[role="dialog"] form h2')?.textContent;
const render = (onConnected = vi.fn()) =>
  act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages}><McpConnectPanel onConnected={onConnected} /></NextIntlClientProvider>,
  ));
const cta = () => document.body.querySelector<HTMLButtonElement>("[data-wizard-cta]")!;

it("installs, then waits for the agent's sign-in while polling the grants", async () => {
  await render();
  const claude = [...host.querySelectorAll("button")].find((item) => item.textContent === "Claude Code")!;
  await act(async () => claude.click());
  expect(heading()).toBe("Add minddy to Claude Code");
  expect(document.body.textContent).toContain("claude mcp add --scope user");
  expect(h.poll).toHaveBeenLastCalledWith(false);

  await act(async () => cta().click());
  expect(heading()).toBe(messages.Account.mcpAuthorizeTitle);
  expect(h.poll).toHaveBeenLastCalledWith(3000);
  // Without a grant, the button does not claim the connection.
  expect(cta().textContent).toContain(messages.Account.mcpWizardDone);
});

it("says the agent is connected once its grant appears", async () => {
  const onConnected = vi.fn();
  h.grants = [{ agent: "claude" }];
  await render(onConnected);
  const claude = [...host.querySelectorAll("button")].find((item) => item.textContent === "Claude Code")!;
  await act(async () => claude.click());
  await act(async () => cta().click());
  expect(heading()).toBe("Claude Code is connected");
  expect(cta().textContent).toContain(messages.Account.mcpDialogDone);
  await act(async () => cta().click());
  expect(onConnected).toHaveBeenCalled();
});
