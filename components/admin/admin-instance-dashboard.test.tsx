// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";

const auth = vi.hoisted(() => ({
  firstTotpFactorId: vi.fn(),
  verifyTotp: vi.fn(),
  user: { email: "me@example.com", app_metadata: {} } as { email: string; app_metadata: Record<string, unknown> },
}));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/settings/settings-ui", () => ({
  SettingsGroup: ({ children, title }: { children: React.ReactNode; title: string }) => <section><h2>{title}</h2>{children}</section>,
  SettingsRow: ({ label, hint, control, children }: { label: React.ReactNode; hint: React.ReactNode; control: React.ReactNode; children: React.ReactNode }) => (
    <div data-row>{label}<p>{hint}</p>{control}{children}</div>
  ),
}));
vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div role="dialog">{children}</div> : null),
    DialogContent: Pass, DialogHeader: Pass, DialogFooter: Pass, DialogTitle: Pass, DialogDescription: Pass,
  };
});
vi.mock("@/components/ui/app-tooltip", () => ({
  AppTooltip: ({ children, label }: { children: React.ReactNode; label: React.ReactNode }) => <>{children}<span data-tooltip>{label}</span></>,
}));
vi.mock("@/components/ui/confirm-delete-dialog", () => ({
  ConfirmDeleteDialog: ({ open, title }: { open: boolean; title: string }) => (open ? <div role="alertdialog">{title}</div> : null),
}));

import { AdminInstanceDashboard } from "./admin-instance-dashboard";

const variables = [
  {
    key: "OPENROUTER_API_KEY", theme: "ai", kind: "secret", applies: "live", sensitive: true,
    source: "both", value: "••••6789", fileValue: "••••", history: [],
  },
  {
    key: "ADMIN_EMAILS", theme: "administrators", kind: "emailList", applies: "live", sensitive: true,
    source: "both", value: "me@example.com,ops@example.com", fileValue: "ops@example.com", history: [
      { index: 0, action: "set", actorName: "Me", at: "2026-10-29T10:00:00Z", value: "me@example.com,ops@example.com" },
      { index: 1, action: "set", actorName: "Ops", at: "2026-10-28T10:00:00Z", value: "ops@example.com" },
      { index: 2, action: "set", actorName: "Ops", at: "2026-10-27T10:00:00Z", value: "ops@example.com,me@example.com" },
    ],
  },
  {
    key: "MINDDY_PUBLIC_SITE_NAME", theme: "site", kind: "text", applies: "restart",
    source: "file", value: "Acme tickets", fileValue: "Acme tickets", history: [],
  },
];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<typeof fetch>();
let host: HTMLDivElement;
let root: Root;
const flush = async (fn?: () => void) => { await act(async () => { fn?.(); }); };
const button = (text: string, scope: ParentNode = document) =>
  Array.from(scope.querySelectorAll("button")).find((b) => b.textContent?.trim() === text)!;
const type = async (input: HTMLInputElement, value: string) => flush(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockImplementation(async (url, init) =>
    !init?.method || init.method === "GET" ? json({ status: "enabled", variables }) : json({ key: "x" }));
  auth.firstTotpFactorId.mockReset().mockResolvedValue("factor-1");
  auth.verifyTotp.mockReset().mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await flush(() => root.render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><AdminInstanceDashboard /></NextIntlClientProvider>));
  await flush();
});
afterEach(async () => {
  await flush(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Instance tab (MIN-847)", () => {
  it("groups the variables by theme, says where each value comes from and hides secrets", () => {
    expect(host.querySelectorAll("h2")[1]?.textContent).toBe("AI");
    expect(host.textContent).toContain("OpenRouter key");
    expect(host.textContent).toContain("Set here · overrides the file");
    expect(host.textContent).toContain("••••6789");
    expect(host.textContent).toContain("From the file");
    expect(host.textContent).not.toMatch(/sk-or/);
  });

  it("never pre-fills a secret and saves what is typed", async () => {
    const row = Array.from(host.querySelectorAll("[data-row]")).find((r) => r.textContent?.includes("OPENROUTER_API_KEY"))!;
    await flush(() => button("Edit", row).click());
    const input = document.querySelector('[role="dialog"] input') as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.type).toBe("password");
    await type(input, "sk-or-v1-new");
    await flush(() => button("Save", document.querySelector('[role="dialog"]')!).click());
    const write = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(String(write[1]!.body))).toEqual({ key: "OPENROUTER_API_KEY", value: "sk-or-v1-new" });
  });

  it("asks for a fresh second factor, then replays the same save", async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === "PATCH") {
        attempts += 1;
        return attempts === 1 ? json({ code: "reauth_required", error: "too old" }, 403) : json({ key: "OPENROUTER_API_KEY" });
      }
      return json({ status: "enabled", variables });
    });
    const row = Array.from(host.querySelectorAll("[data-row]")).find((r) => r.textContent?.includes("OPENROUTER_API_KEY"))!;
    await flush(() => button("Edit", row).click());
    await type(document.querySelector('[role="dialog"] input') as HTMLInputElement, "sk-or-v1-new");
    await flush(() => button("Save", document.querySelector('[role="dialog"]')!).click());
    expect(document.body.textContent).toContain("Confirm it’s you");
    const dialogs = document.querySelectorAll('[role="dialog"]');
    const codeInput = dialogs[dialogs.length - 1].querySelector("input") as HTMLInputElement;
    await type(codeInput, "123456");
    await flush(() => button("Confirm", dialogs[dialogs.length - 1]).click());
    expect(auth.verifyTotp).toHaveBeenCalledWith("factor-1", "123456");
    expect(attempts).toBe(2);
  });

  it("finds a variable by its name, label or help, ignoring case and accents", async () => {
    const search = host.querySelector('input[type="search"]') as HTMLInputElement;
    await type(search, "openrouter_api");
    expect(host.textContent).toContain("OPENROUTER_API_KEY");
    expect(host.textContent).not.toContain("MINDDY_PUBLIC_SITE_NAME");
    await type(search, "INSTÀNCE NAME");
    expect(host.textContent).toContain("MINDDY_PUBLIC_SITE_NAME");
    expect(host.textContent).not.toContain("OPENROUTER_API_KEY");
    await type(search, "nothing like this");
    expect(host.textContent).toContain("No variable matches “nothing like this”.");
    await flush(() => host.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]')!.click());
    expect(host.textContent).toContain("OPENROUTER_API_KEY");
    expect(host.textContent).toContain("MINDDY_PUBLIC_SITE_NAME");
  });

  it("explains each source badge in a tooltip", () => {
    const tooltips = Array.from(host.querySelectorAll("[data-tooltip]")).map((tip) => tip.textContent);
    expect(tooltips).toContain(messages.Admin.instance.sourceHelp.file);
    expect(tooltips).toContain(messages.Admin.instance.sourceHelp.both);
  });

  it("asks for confirmation before removing an override", async () => {
    const row = Array.from(host.querySelectorAll("[data-row]")).find((r) => r.textContent?.includes("OPENROUTER_API_KEY"))!;
    await flush(() => button("Remove", row).click());
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toBe("Remove the value of OpenRouter key?");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });

  it("refuses to save an administrator list without your own address", async () => {
    const row = Array.from(host.querySelectorAll("[data-row]")).find((r) => r.textContent?.includes("ADMIN_EMAILS"))!;
    await flush(() => button("Edit", row).click());
    const input = document.querySelector('[role="dialog"] input') as HTMLInputElement;
    expect(input.value).toBe("me@example.com,ops@example.com");
    // One letter off one's own address is enough to lock oneself out.
    await type(input, "m@example.com,ops@example.com");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("me@example.com");
    expect(button("Save", document.querySelector('[role="dialog"]')!).disabled).toBe(true);
    await flush(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    await type(input, "ops@example.com, ME@example.com");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(button("Save", document.querySelector('[role="dialog"]')!).disabled).toBe(false);
  });

  it("will not remove an override when the file list does not name you", () => {
    const row = Array.from(host.querySelectorAll("[data-row]")).find((r) => r.textContent?.includes("ADMIN_EMAILS"))!;
    expect(button("Remove", row).disabled).toBe(true);
    const other = Array.from(host.querySelectorAll("[data-row]")).find((r) => r.textContent?.includes("OPENROUTER_API_KEY"))!;
    expect(button("Remove", other).disabled).toBe(false);
  });

  it("an administrator by role may leave the list", async () => {
    auth.user = { email: "me@example.com", app_metadata: { role: "admin" } };
    await flush(() => root.render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><AdminInstanceDashboard key="role" /></NextIntlClientProvider>));
    await flush();
    const row = Array.from(host.querySelectorAll("[data-row]")).find((r) => r.textContent?.includes("ADMIN_EMAILS"))!;
    expect(button("Remove", row).disabled).toBe(false);
    auth.user = { email: "me@example.com", app_metadata: {} };
  });

  it("will not restore an administrator list that does not name you", async () => {
    const row = Array.from(host.querySelectorAll("[data-row]")).find((r) => r.textContent?.includes("ADMIN_EMAILS"))!;
    await flush(() => Array.from(row.querySelectorAll("button")).find((b) => b.textContent?.startsWith("History"))!.click());
    const restores = Array.from(row.querySelectorAll("button")).filter((b) => b.textContent?.trim() === "Restore");
    expect(restores.map((b) => b.disabled)).toEqual([true, false]);
    expect(row.textContent).toContain(messages.Admin.instance.keepOwnAddressRestore);
  });
});
