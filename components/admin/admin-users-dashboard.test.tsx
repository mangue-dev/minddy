// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";

vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/lib/use-admin-capabilities", () => ({ useAdminCapabilities: () => ({ configured: () => true }) }));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/components/settings/settings-ui", () => ({
  SettingsGroup: ({ children, title, footer }: { children: React.ReactNode; title: string; footer: React.ReactNode }) => <section><h2>{title}</h2>{children}{footer}</section>,
  SettingsRow: ({ control, children, label }: { control: React.ReactNode; children: React.ReactNode; label: string }) => <div>{label}{control}{children}</div>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
}));
vi.mock("mangue-ui", () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return {
    Button: ({ children, variant: _variant, size: _size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => <button {...props}>{children}</button>,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Badge: Wrapper, Select: Wrapper, SelectContent: Wrapper, SelectItem: Wrapper, SelectTrigger: Wrapper, SelectValue: () => null,
    Sheet: ({ children, onOpenChange }: { children: React.ReactNode; onOpenChange: (open: boolean) => void }) => <div data-sheet><button onClick={() => onOpenChange(false)}>Close account</button>{children}</div>,
    SheetContent: Wrapper, SheetDescription: Wrapper, SheetHeader: Wrapper, SheetTitle: Wrapper,
    Skeleton: () => null, Spinner: () => null, Switch: () => null,
    cn: (...values: unknown[]) => values.filter(Boolean).join(" "), toast: { success: vi.fn(), error: vi.fn() },
  };
});
import { AdminUsersDashboard } from "./admin-users-dashboard";

const account = { userId: "11111111-1111-4111-8111-111111111111", name: "Support Fixture", email: "support@example.test", internal: false, emailConfirmed: true };
const user = { ...account, billing: { planId: "pro", source: "default", override: null, overrideNote: null, overrideExpiresAt: null, stripePlanId: null, stripeStatus: null }, usage: { budgetUsd: 20, spentUsd: 2, spentMonthUsd: 3, blocked: false } };
const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<typeof fetch>();
let host: HTMLDivElement;
let root: Root;
const flush = async (fn?: () => void) => { await act(async () => { fn?.(); }); };
const button = (text: string) => Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes(text))!;
const type = async (value: string) => flush(() => {
  const input = document.querySelector("#admin-support-email") as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const submit = async () => flush(() => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

beforeEach(async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await flush(() => root.render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><AdminUsersDashboard /></NextIntlClientProvider>));
});
afterEach(async () => { await flush(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("account support flow", () => {
  it("loads no accounts until an explicit form submission and opens details on demand", async () => {
    expect(fetchMock).not.toHaveBeenCalled();
    await type(account.email);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(json({ account }));
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/users");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ email: account.email }), cache: "no-store" });
    expect(host.querySelector("[data-sheet]")).toBeNull();
    fetchMock.mockResolvedValueOnce(json({ user })).mockResolvedValueOnce(json({ resets: [] }));
    await flush(() => button("Open account").click());
    expect(host.querySelector("[data-sheet]")).not.toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/admin/users?userId=${account.userId}`);
    expect(host.textContent).not.toMatch(/Onboarding|Last sign|Projects|Created/);
  });

  it("clearing a pending lookup aborts it and prevents the stale identity from returning", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await type(account.email); await submit();
    await type("");
    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(true);
    await flush(() => resolve(json({ account })));
    expect(host.textContent).not.toContain(account.name);
  });

  it("editing a search while details load prevents a stale account sheet", async () => {
    fetchMock.mockResolvedValueOnce(json({ account }));
    await type(account.email); await submit();
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await flush(() => button("Open account").click());
    await type("new@example.test");
    await flush(() => resolve(json({ user })));
    expect(host.querySelector("[data-sheet]")).toBeNull();
    expect(host.textContent).not.toContain(account.name);
  });

  it("reports a failed detail read without opening an actionable account sheet", async () => {
    fetchMock.mockResolvedValueOnce(json({ account }));
    await type(account.email); await submit();
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    await flush(() => button("Open account").click());
    expect(host.querySelector("[data-sheet]")).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not load billing");
  });

  it("a late support mutation cannot reopen a closed account", async () => {
    fetchMock.mockResolvedValueOnce(json({ account }));
    await type(account.email); await submit();
    fetchMock.mockResolvedValueOnce(json({ user })).mockResolvedValueOnce(json({ resets: [] }));
    await flush(() => button("Open account").click());
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await flush(() => button("Reset").click());
    await flush(() => button("Close account").click());
    const requests = fetchMock.mock.calls.length;
    await flush(() => resolve(json({ resets: [], usage: { spentUsd: 0, blocked: false } })));
    expect(fetchMock).toHaveBeenCalledTimes(requests);
    expect(host.querySelector("[data-sheet]")).toBeNull();
  });
});
