// @vitest-environment jsdom
import { act, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { NativeAgentConnections } from "./native-agent-connections";

const api = vi.hoisted(() => ({
  fetchNativeConnections: vi.fn(), startNativeLogin: vi.fn(), readNativeLogin: vi.fn(),
  cancelNativeLogin: vi.fn(), submitNativeLoginCode: vi.fn(),
  disconnectNativeConnection: vi.fn(), testNativeConnection: vi.fn(),
}));
vi.mock("@/components/mcp-agent-logo", () => ({
  McpAgentLogo: () => null,
}));
vi.mock("@/lib/native-agent-prototype-api", async (original) => ({
  ...await original<typeof import("@/lib/native-agent-prototype-api")>(), ...api,
}));
vi.mock("mangue-ui", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({ size: _size, variant: _variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) => <button {...props} />,
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Select: ({ value, disabled, onValueChange, children }: { value: string; disabled: boolean; onValueChange: (value: string) => void; children: ReactNode }) => <select aria-label="Code agent" value={value} disabled={disabled} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectItem: ({ value, disabled, children }: { value: string; disabled?: boolean; children: ReactNode }) => <option value={value} disabled={disabled}>{children}</option>,
}));
vi.mock("./settings-ui", () => ({
  SettingsGroup: ({ title, action, children, className }: { title: ReactNode; action: ReactNode; children: ReactNode; className: string }) => <section className={className}><h2>{title}</h2>{action}{children}</section>,
  SettingsRow: ({ label, hint, control, children }: { label: ReactNode; hint: ReactNode; control: ReactNode; children: ReactNode }) => <article><h3>{label}</h3><p>{hint}</p>{control}{children}</article>,
}));

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.fetchNativeConnections.mockResolvedValue({ enabled: true, connections: [] });
  api.cancelNativeLogin.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render(props: Parameters<typeof NativeAgentConnections>[0] = {}) {
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}>
    <NativeAgentConnections {...props} />
  </NextIntlClientProvider>));
}
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find((node) => node.textContent === label);
  expect(button).toBeDefined();
  await act(() => button!.click());
}

it("keeps OpenCode visible while the allowlist disables native selection", async () => {
  api.fetchNativeConnections.mockResolvedValue({ enabled: false, connections: [] });
  await render({ onEngineChange: vi.fn(), nativeAgentsEnabled: false });
  expect(host.textContent).toContain("OpenCode");
  expect(host.querySelector('option[value="codex"]')?.hasAttribute("disabled")).toBe(true);
  expect(host.querySelector("button")).toBeNull();
  expect(api.startNativeLogin).not.toHaveBeenCalled();
});

it("uses native approval links and clears a pending login when settings close", async () => {
  api.startNativeLogin.mockResolvedValue({ attemptId: "one", status: "waiting",
    verificationUrl: "https://auth.openai.com/codex/device", userCode: "ABCD-1234" });
  await render({ defaultEngine: "codex" });
  await click("Connect Codex");
  expect(host.querySelector("a")?.href).toBe("https://auth.openai.com/codex/device");
  expect(host.querySelector("a")?.rel).toBe("noopener noreferrer");
  expect(host.textContent).toContain("ABCD-1234");
  expect(host.querySelector(".ph-no-capture.ph-mask.rr-block")).not.toBeNull();
  await act(() => root.unmount());
  expect(api.cancelNativeLogin).toHaveBeenCalledWith("codex", "one");
});

it("rejects lookalike approval hosts and never renders raw native errors", async () => {
  api.startNativeLogin.mockResolvedValue({ attemptId: "one", status: "waiting",
    verificationUrl: "https://auth.openai.com.attacker.test/secret" });
  api.readNativeLogin.mockResolvedValue({ attemptId: "one", status: "failed", errorCode: "sk-native-secret" });
  await render({ defaultEngine: "codex" });
  await click("Connect Codex");
  expect(host.querySelector("a")).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("The request failed. Try again.");
  expect(host.innerHTML).not.toContain("sk-native-secret");
  expect(host.innerHTML).not.toContain("attacker.test");
});

it("shows only the selected connection and removes diagnostic and preview controls", async () => {
  api.fetchNativeConnections.mockResolvedValue({ enabled: true, connections: [
    { engine: "codex", status: "connected", updatedAt: null },
    { engine: "claude_code", status: "connected", updatedAt: null },
  ] });
  await render({ defaultEngine: "codex", onEngineChange: vi.fn() });
  expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Disconnect"]);
  expect(host.textContent).not.toContain("Private preview");
  expect(host.textContent).not.toContain("Test new sandboxes");
  expect(api.testNativeConnection).not.toHaveBeenCalled();
  await render({ defaultEngine: "claude_code", onEngineChange: vi.fn() });
  expect(host.querySelector("article:last-of-type h3")?.textContent).toBe("Claude Code");
});

it("permits eligible native selection before connection without automatically authenticating", async () => {
  api.fetchNativeConnections.mockResolvedValue({ enabled: true, connections: [
    { engine: "codex", status: "busy", updatedAt: null },
    { engine: "claude_code", status: "reconnect_required", updatedAt: null },
  ] });
  const save = vi.fn().mockResolvedValue(undefined);
  await render({ onEngineChange: save, nativeAgentsEnabled: true });
  const select = host.querySelector("select")!;
  expect(select.querySelector<HTMLOptionElement>('[value="codex"]')!.disabled).toBe(false);
  expect(select.querySelector<HTMLOptionElement>('[value="claude_code"]')!.disabled).toBe(false);
  await act(() => { select.value = "codex"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(save).toHaveBeenCalledWith("codex");
  expect(api.startNativeLogin).not.toHaveBeenCalled();
  expect(host.querySelector("button")).toBeNull();
});

it("retains an unavailable native default and offers explicit OpenCode recovery", async () => {
  api.fetchNativeConnections.mockResolvedValue({ enabled: false, connections: [] });
  const save = vi.fn().mockResolvedValue(undefined);
  await render({ defaultEngine: "codex", nativeAgentsEnabled: false, onEngineChange: save });
  const select = host.querySelector("select")!;
  expect(select.value).toBe("codex");
  expect(host.textContent).toContain(messages.NativeAgentConnections.engineUnavailable);
  expect(host.querySelector("button")).toBeNull();
  expect(save).not.toHaveBeenCalled();
  await act(() => { select.value = "opencode"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(save).toHaveBeenCalledWith("opencode");
});

it("keeps the native default when its connection is removed and sanitizes selection failures", async () => {
  api.fetchNativeConnections.mockResolvedValue({ enabled: true, connections: [] });
  const save = vi.fn().mockRejectedValue(new Error("secret native transcript"));
  await render({ defaultEngine: "codex", nativeAgentsEnabled: true, onEngineChange: save });
  const select = host.querySelector("select")!;
  expect(select.value).toBe("codex");
  expect(host.textContent).toContain("Connect this account before starting code work");
  expect(save).not.toHaveBeenCalled();
  await act(() => { select.value = "opencode"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(select.value).toBe("codex");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("The request failed. Try again.");
  expect(host.innerHTML).not.toContain("secret native transcript");
});

it("cancels a pending connection when the selected agent changes", async () => {
  api.startNativeLogin.mockResolvedValue({ attemptId: "pending", status: "waiting",
    verificationUrl: "https://auth.openai.com/codex/device", userCode: "ABCD-1234" });
  await render({ defaultEngine: "codex" });
  await click("Connect Codex");
  await render({ defaultEngine: "claude_code" });
  expect(api.cancelNativeLogin).toHaveBeenCalledWith("codex", "pending");
  expect(host.textContent).not.toContain("ABCD-1234");
  expect(host.textContent).toContain("Connect Claude Code");
  expect(api.startNativeLogin).toHaveBeenCalledTimes(1);
});

it("labels OpenCode with its actual API payer and hides native connection actions", async () => {
  await render({ onEngineChange: vi.fn(), openCodeProviderLabel: "Minddy Cloud" });
  expect(host.textContent).toContain("OpenCode (Minddy Cloud)");
  expect(host.querySelector("button")).toBeNull();
  await render({ onEngineChange: vi.fn(), openCodeProviderLabel: "OpenRouter" });
  expect(host.textContent).toContain("OpenCode (OpenRouter)");
});
