// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { AccountNumoSection } from "./account-numo-section";

const h = vi.hoisted(() => ({
  prefs: {} as Record<string, unknown>,
  set: vi.fn(),
}));
vi.mock("@/components/settings/use-account-preference", () => ({
  useAccountPreference: (key: string) => [h.prefs[key], (value: unknown) => h.set(key, value), true],
}));
vi.mock("@/components/issue-indicators", () => ({ StatusIndicator: () => null }));
vi.mock("@/components/settings/settings-ui", () => ({
  SettingsGroup: ({ title, children }: { title: string; children: ReactNode }) => <section><h3>{title}</h3>{children}</section>,
  SettingsRow: ({ label, hint, control }: { label: ReactNode; hint?: ReactNode; control: ReactNode }) =>
    <article><h4>{label}</h4><p>{hint}</p>{control}</article>,
}));
vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, disabled, onCheckedChange, ...props }: { checked: boolean; disabled?: boolean; onCheckedChange: (value: boolean) => void; "aria-label": string }) =>
    <input type="checkbox" aria-label={props["aria-label"]} checked={checked} disabled={disabled}
      onChange={(event) => onCheckedChange(event.target.checked)} />,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.prefs = { numo_memory: true, numo_background: true, numo_default_status: "triage" };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = () => act(() => root.render(
  <NextIntlClientProvider locale="en" messages={messages}><AccountNumoSection /></NextIntlClientProvider>));
const toggle = (label: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

it("keeps background Numo off and locked while the memory is off", async () => {
  h.prefs.numo_memory = false;
  await render();
  expect(toggle(messages.Account.numoBackgroundSwitch).checked).toBe(false);
  expect(toggle(messages.Account.numoBackgroundSwitch).disabled).toBe(true);
  expect(host.textContent).toContain(messages.Account.numoBackgroundNeedsMemory);
  await act(async () => toggle(messages.Account.numoMemorySwitch).click());
  expect(h.set).toHaveBeenCalledWith("numo_memory", true);
});
