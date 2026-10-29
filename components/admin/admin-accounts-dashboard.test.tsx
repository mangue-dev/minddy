// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";

vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/lib/use-admin-capabilities", () => ({ useAdminCapabilities: () => ({ configured: () => true }) }));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/components/stats/stats-chrome", () => ({
  StatsCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Metric: ({ label, value, hint }: { label: string; value: React.ReactNode; hint: React.ReactNode }) => <div data-metric>{label}{value}{hint}</div>,
}));
vi.mock("@/components/settings/settings-ui", () => ({
  SettingsGroup: ({ children, title, footer }: { children: React.ReactNode; title: string; footer: React.ReactNode }) => <section><h2>{title}</h2>{children}{footer}</section>,
  SettingsRow: ({ control, children, label }: { control: React.ReactNode; children: React.ReactNode; label: string }) => <div>{label}{control}{children}</div>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
}));
// Stubs for the UI primitives the component under test renders.
const uiStubs = vi.hoisted(() => {
  let value: Promise<Record<string, unknown>> | undefined;
  return () => (value ??= (async () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return {
    Button: ({ children, variant: _variant, size: _size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => <button {...props}>{children}</button>,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Badge: Wrapper, Select: Wrapper, SelectContent: Wrapper, SelectItem: Wrapper, SelectTrigger: Wrapper, SelectValue: () => null,
    Sheet: ({ children, onOpenChange }: { children: React.ReactNode; onOpenChange: (open: boolean) => void }) => <div data-sheet><button onClick={() => onOpenChange(false)}>Close account</button>{children}</div>,
    SheetContent: Wrapper, SheetDescription: Wrapper, SheetHeader: Wrapper, SheetTitle: Wrapper,
    Skeleton: () => null, Spinner: () => null,
    cn: (...values: unknown[]) => values.filter(Boolean).join(" "), toast: { success: vi.fn(), error: vi.fn() },
  };
})());
});
vi.mock("@/components/ui/button", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Button: stubs.Button };
});
vi.mock("@/components/ui/input", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Input: stubs.Input };
});
vi.mock("@/components/ui/badge", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Badge: stubs.Badge };
});
vi.mock("@/components/ui/select", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Select: stubs.Select, SelectContent: stubs.SelectContent, SelectItem: stubs.SelectItem, SelectTrigger: stubs.SelectTrigger, SelectValue: stubs.SelectValue };
});
vi.mock("@/components/ui/sheet", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Sheet: stubs.Sheet, SheetContent: stubs.SheetContent, SheetDescription: stubs.SheetDescription, SheetHeader: stubs.SheetHeader, SheetTitle: stubs.SheetTitle };
});
vi.mock("@/components/ui/skeleton", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Skeleton: stubs.Skeleton };
});
vi.mock("@/components/ui/spinner", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Spinner: stubs.Spinner };
});
vi.mock("sonner", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), toast: stubs.toast };
});
import { AdminAccountsDashboard } from "./admin-accounts-dashboard";

const account = { userId: "11111111-1111-4111-8111-111111111111", name: "Support Fixture", email: "support@example.test", emailConfirmed: true };
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
  // The account count loads with the tab; every other request is queued per test.
  fetchMock.mockReset().mockImplementation(async (url) =>
    url === "/api/admin/overview" ? json({ totalAccounts: 1234 }) : new Response("", { status: 500 }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await flush(() => root.render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><AdminAccountsDashboard /></NextIntlClientProvider>));
  await flush();
  fetchMock.mockClear();
});
afterEach(async () => { await flush(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("account count (MIN-829)", () => {
  it("shows the number of accounts and nothing else about them", () => {
    expect(host.querySelector("[data-metric]")?.textContent).toContain("1,234");
    expect(host.textContent).not.toMatch(/Onboarding|Sign-ups|Active today|Projects|Internal/);
  });
});

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
