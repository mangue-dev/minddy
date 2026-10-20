// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { McpConnection } from "@/lib/mcp-connection";
import { AccountMcpClients } from "./account-mcp-clients";

const h = vi.hoisted(() => ({ invalidate: vi.fn(), fetch: vi.fn() }));
const connection: McpConnection = {
  id: "conn-1", name: "Linear", url: "https://mcp.linear.app/mcp", enabled: true,
  has_token: false, has_headers: false, transport: "http", auth_mode: "none",
  oauth_connected: false, created_at: "2026-10-20",
};
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: h.invalidate }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/use-mcp-connections", () => ({
  MCP_CONNECTIONS_QUERY_KEY: ["account-mcp-connections"],
  useMcpConnections: () => ({ data: { connections: [connection] }, isPending: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/use-mcp-registry-search", () => ({
  MCP_REGISTRY_SEARCH_MIN_LENGTH: 2,
  useMcpRegistrySearch: () => ({ servers: [], debounced: "" }),
}));
vi.mock("@/components/mcp-service-logo", () => ({ McpServiceLogo: () => null }));
vi.mock("@/components/settings/settings-ui", () => ({
  SettingsGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
// The menu renders its items inline: Radix menus open on pointer events jsdom does not dispatch.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" data-menu-item onClick={() => onSelect?.()}>{children}</button>
  ),
}));
vi.mock("@/components/ui/tooltip", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  h.fetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", h.fetch);
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

it("asks for confirmation before removing a personal MCP connection", async () => {
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages}><AccountMcpClients /></NextIntlClientProvider>,
  ));
  const remove = [...host.querySelectorAll<HTMLButtonElement>("[data-menu-item]")]
    .find((item) => item.textContent === messages.McpClients.remove)!;
  await act(async () => remove.click());
  expect(h.fetch).not.toHaveBeenCalled();
  const dialog = document.body.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain("Remove Linear?");

  const confirm = [...dialog.querySelectorAll("button")].find((button) => button.textContent === messages.McpClients.remove)!;
  await act(async () => confirm.click());
  expect(h.fetch).toHaveBeenCalledWith("/api/account/mcp-connections/conn-1", { method: "DELETE" });
});
