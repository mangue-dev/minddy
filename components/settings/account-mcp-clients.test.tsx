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
  SettingsGroup: ({ children, action }: { children: ReactNode; action?: ReactNode }) => <div>{action}{children}</div>,
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
// Steps swap at once: the exit animation of `mode="wait"` never ends in jsdom.
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
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

function render() {
  return act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages}><AccountMcpClients /></NextIntlClientProvider>,
  ));
}
// The step title, not the dialog's screen-reader name.
const heading = () => document.body.querySelector('[role="dialog"] form h2')?.textContent;
const button = (label: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes(label))!;
async function type(id: string, value: string) {
  const input = document.body.querySelector<HTMLInputElement>(`[id$="${id}"]`)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => document.body.querySelector<HTMLButtonElement>("[data-wizard-cta]")!.click());
}

it("walks a custom server through address, sign-in choice and an automatic check", async () => {
  h.fetch.mockImplementation(async (path: string) => ({
    ok: true,
    json: async () => (path.endsWith("/test") ? { tools: 3 } : { id: "conn-2" }),
  }));
  await render();
  await act(async () => host.querySelector<HTMLButtonElement>(`[aria-label="${messages.McpClients.custom}"]`)!.click());
  expect(heading()).toBe(messages.McpClients.serverTitle);

  await type("-name", "Docs");
  await type("-url", "http://docs.example.com/mcp");
  await submit();
  // A non-HTTPS address is refused before the sign-in step.
  expect(document.body.textContent).toContain(messages.McpClients.errorEndpoint);
  expect(heading()).toBe(messages.McpClients.serverTitle);

  await type("-url", "https://docs.example.com/mcp");
  await submit();
  expect(heading()).toBe("How should Numo sign in to Docs?");

  await act(async () => button(messages.McpClients.noAuth).click());
  await submit();
  expect(h.fetch).toHaveBeenCalledWith("/api/account/mcp-connections", expect.objectContaining({ method: "POST" }));
  const body = JSON.parse(h.fetch.mock.calls.find(([path]) => path === "/api/account/mcp-connections")![1].body);
  expect(body).toMatchObject({ name: "Docs", url: "https://docs.example.com/mcp", auth_mode: "none", token: "" });
  expect(h.fetch).toHaveBeenCalledWith("/api/account/mcp-connections/conn-2/test", { method: "POST" });
  expect(heading()).toBe("Connection to Docs");
  expect(document.body.textContent).toContain("Numo can use Docs: 3 tools found.");
});

it("opens a curated preset on the sign-in step and edits the saved connection", async () => {
  h.fetch.mockImplementation(async (path: string) => ({
    ok: true,
    json: async () => (path.endsWith("/test") ? { tools: 1 } : {}),
  }));
  await render();
  await act(async () => button(messages.McpClients.edit).click());
  // A saved connection already has its method: shown, not asked again.
  expect(heading()).toBe("Edit Linear");
  expect(document.body.querySelector('[role="radiogroup"]')).toBeNull();

  await submit();
  expect(h.fetch).toHaveBeenCalledWith("/api/account/mcp-connections/conn-1", expect.objectContaining({ method: "PATCH" }));
  const body = JSON.parse(h.fetch.mock.calls.find(([path]) => path === "/api/account/mcp-connections/conn-1")![1].body);
  // An unchanged token field keeps the saved token.
  expect(body).not.toHaveProperty("token");
  expect(document.body.textContent).toContain("Numo can use Linear: 1 tool found.");
});

it("shows a catalog service's sign-in method instead of asking for it", async () => {
  await render();
  const github = [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "GitHub")!;
  await act(async () => github.click());
  expect(heading()).toBe("Connect GitHub");
  expect(document.body.querySelector('[role="radiogroup"]')).toBeNull();
  // The catalog says GitHub takes a token: its field is already there.
  expect(document.body.querySelector('[id$="-token"]')).not.toBeNull();

  await act(async () => button(messages.McpClients.authChange).click());
  expect(heading()).toBe("How should Numo sign in to GitHub?");
  const selected = document.body.querySelector('[role="radio"][aria-checked="true"]');
  expect(selected?.textContent).toContain(messages.McpClients.bearer);
});
