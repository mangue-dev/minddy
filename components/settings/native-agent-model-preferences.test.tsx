// @vitest-environment jsdom
import { act, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { NativeAgentModelPreferences } from "./native-agent-model-preferences";

const h = vi.hoisted(() => ({
  save: vi.fn(), invalidate: vi.fn(), refresh: vi.fn(), error: null,
  models: [
    { id: "codex-current", displayName: "Codex Current", supportedReasoningEfforts: ["low", "high"], isDefault: true },
    { id: "codex-new", displayName: "Codex New", supportedReasoningEfforts: ["medium", "ultra"], isDefault: false },
  ],
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: h.invalidate }) }));
vi.mock("@/lib/agent-keys-api", () => ({ saveAgentPreferencesApi: h.save }));
vi.mock("@/lib/use-native-agent-models-query", () => ({
  useNativeAgentModelsQuery: () => ({ data: { models: h.models }, isPending: false,
    error: h.error, refresh: { mutate: h.refresh, isPending: false, error: null } }),
}));
vi.mock("./settings-ui", () => ({ SettingsRow: ({ label, control, children }: { label: ReactNode; control: ReactNode; children: ReactNode }) => <article>{label}{control}{children}</article> }));
vi.mock("mangue-ui", () => ({
  toast: { success: vi.fn() },
  Button: ({ size: _size, variant: _variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) => <button {...props} />,
  Select: ({ value, disabled, onValueChange, children }: { value: string; disabled?: boolean; onValueChange: (value: string) => void; children: ReactNode }) => <select value={value} disabled={disabled} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, disabled, children }: { value: string; disabled?: boolean; children: ReactNode }) => <option value={value} disabled={disabled}>{children}</option>,
}));
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.save.mockResolvedValue(undefined); h.invalidate.mockResolvedValue(undefined);
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(props: Partial<Parameters<typeof NativeAgentModelPreferences>[0]> = {}) {
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}>
    <NativeAgentModelPreferences engine="codex" enabled loading={false}
      preference={{ model: "codex-current", reasoningEffort: "high" }} {...props} />
  </NextIntlClientProvider>));
}
async function change(index: number, value: string) {
  const control = host.querySelectorAll("select")[index];
  await act(() => { control.value = value; control.dispatchEvent(new Event("change", { bubbles: true })); });
}
it("resets effort when changing native models without overwriting another engine", async () => {
  await render(); await change(0, "codex-new");
  expect(h.save).toHaveBeenCalledWith({ native_model_preferences: { codex: { model: "codex-new", reasoningEffort: null } } });
  expect(h.invalidate).toHaveBeenCalledOnce();
});
it("offers only advertised efforts and preserves ultra without API normalization", async () => {
  await render({ preference: { model: "codex-new", reasoningEffort: null } });
  expect([...host.querySelectorAll("select")[1].options].map((item) => item.value)).toEqual(["__native_default__", "medium", "ultra"]);
  await change(1, "ultra");
  expect(h.save).toHaveBeenCalledWith({ native_model_preferences: { codex: { model: "codex-new", reasoningEffort: "ultra" } } });
});
it("shows an unavailable saved model instead of silently replacing it", async () => {
  await render({ preference: { model: "retired-model", reasoningEffort: "high" } });
  expect(host.querySelector("select")?.value).toBe("retired-model");
  expect(host.querySelector('option[value="retired-model"]')?.hasAttribute("disabled")).toBe(true);
  expect(host.textContent).toContain("This saved model is absent");
  expect(h.save).not.toHaveBeenCalled(); expect(h.refresh).not.toHaveBeenCalled();
});
it("refreshes Codex only on request and keeps Claude alias controls available", async () => {
  await render(); expect(h.refresh).not.toHaveBeenCalled();
  await act(() => host.querySelector("button")!.click()); expect(h.refresh).toHaveBeenCalledOnce();
  await render({ engine: "claude_code" });
  expect(host.querySelector("button")).toBeNull(); expect(host.querySelectorAll("select")).toHaveLength(2);
});
it("keeps rejected saves out of raw notifications and preserves the previous choice", async () => {
  h.save.mockRejectedValue(new Error("secret transcript")); await render(); await change(0,"codex-new");
  expect(host.querySelector("select")?.value).toBe("codex-current");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(messages.NativeAgentModels.saveError);
  expect(host.innerHTML).not.toContain("secret transcript");
});
