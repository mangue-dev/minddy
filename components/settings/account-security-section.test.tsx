// @vitest-environment jsdom
import { act, createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { AuthSessionSummary } from "@/lib/types";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AccountSecuritySection } from "./account-security-section";

const h = vi.hoisted(() => ({
  signOut: vi.fn(),
  callback: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
  leaveProtectedScreen: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  invalidate: vi.fn(),
  sessions: [] as AuthSessionSummary[],
  sessionsFailed: false,
  fetch: vi.fn(),
  revokeStatus: 204,
}));
// The real AuthProvider runs, so the assertion reaches the SDK call itself.
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: null }, error: null }),
  signOut: h.signOut,
  onAuthStateChange: (callback: typeof h.callback) => {
    h.callback = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  },
} }) }));
vi.mock("@/lib/query-provider", () => ({ clearPersistedQueryCache: vi.fn() }));
vi.mock("@/lib/app-tabs-storage", () => ({ clearAppTabsWindowState: vi.fn() }));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => ({ identify: vi.fn(), reset: vi.fn(), track: vi.fn() }) }));
vi.mock("@/lib/runtime-config-provider", () => ({ browserRuntimeConfig: () => ({
  supabaseUrl: "https://synthetic.supabase.co", supabaseAnonKey: "public",
}) }));
vi.mock("@/lib/interface-locale", () => ({ readInterfaceLocale: () => "en" }));
vi.mock("@/lib/signed-out-redirect", () => ({ leaveProtectedScreenAfterSignOut: h.leaveProtectedScreen }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: h.invalidate }) }));
vi.mock("@/lib/use-auth-sessions-query", async (importActual) => ({
  revokeAuthSessionApi: (await importActual<typeof import("@/lib/use-auth-sessions-query")>()).revokeAuthSessionApi,
  authSessionsQueryKey: ["auth-sessions"],
  useAuthSessionsQuery: () => ({ sessions: h.sessions, loading: false, failed: h.sessionsFailed }),
}));
vi.mock("@/lib/use-mfa-status", () => ({
  mfaStatusQueryKey: ["mfa-status"],
  useMfaStatusQuery: () => ({ status: { enabled: false, unusedRecoveryCodes: 0 } }),
}));
vi.mock("@/components/otp-input", () => ({ OtpInput: () => null }));
vi.mock("@/components/settings/settings-ui", () => ({
  SettingsGroup: ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  SettingsRow: ({ label, hint, control, children }: { label: ReactNode; hint: ReactNode; control: ReactNode; children: ReactNode }) =>
    <article>{label}{hint}{control}{children}</article>,
  SettingsEmpty: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  SettingsListRow: ({ title, subtitle, action }: { title: ReactNode; subtitle: ReactNode; action: ReactNode }) =>
    <li><span>{title} — {subtitle}</span>{action}</li>,
}));
// Stubs for the UI primitives the component under test renders.
const uiStubs = vi.hoisted(() => {
  let value: Promise<Record<string, unknown>> | undefined;
  return () => (value ??= (async () => {
  const Dialog = createContext<(open: boolean) => void>(() => {});
  const content = ({ children }: { children: ReactNode }) => <>{children}</>;
  const Button = ({ variant: _variant, size: _size, ...props }: ComponentProps<"button"> & { variant?: string; size?: string }) =>
    <button {...props} />;
  return {
    toast: { success: h.toastSuccess, error: h.toastError },
    Badge: content, Checkbox: () => null, Spinner: () => null, Button,
    AlertDialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) =>
      open ? <Dialog.Provider value={onOpenChange}><div role="alertdialog">{children}</div></Dialog.Provider> : null,
    AlertDialogContent: content, AlertDialogHeader: content, AlertDialogFooter: content,
    AlertDialogTitle: content, AlertDialogDescription: content,
    AlertDialogAction: Button,
    AlertDialogCancel: function Cancel({ children }: { children: ReactNode }) {
      const setOpen = useContext(Dialog);
      return <button onClick={() => setOpen(false)}>{children}</button>;
    },
  };
})());
});
vi.mock("sonner", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), toast: stubs.toast };
});
vi.mock("@/components/ui/badge", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Badge: stubs.Badge };
});
vi.mock("@/components/ui/checkbox", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Checkbox: stubs.Checkbox };
});
vi.mock("@/components/ui/spinner", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Spinner: stubs.Spinner };
});
vi.mock("@/components/ui/button", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Button: stubs.Button };
});
vi.mock("@/components/ui/alert-dialog", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), AlertDialog: stubs.AlertDialog, AlertDialogContent: stubs.AlertDialogContent, AlertDialogHeader: stubs.AlertDialogHeader, AlertDialogFooter: stubs.AlertDialogFooter, AlertDialogTitle: stubs.AlertDialogTitle, AlertDialogDescription: stubs.AlertDialogDescription, AlertDialogAction: stubs.AlertDialogAction, AlertDialogCancel: stubs.AlertDialogCancel };
});

const currentSession = {
  access_token: "token-current", refresh_token: "refresh-current", expires_in: 3_600, token_type: "bearer",
  user: { id: "owner", aud: "authenticated", created_at: "2026-01-01T00:00:00Z", user_metadata: { locale: "en" }, app_metadata: {} },
} satisfies Session;

const session = (fields: Partial<AuthSessionSummary> & { id: string }): AuthSessionSummary => ({
  current: false, browser: null, platform: null,
  created_at: "2026-10-01T09:00:00Z", last_active_at: "2026-10-15T18:30:00Z", ...fields,
});

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let token: string | null;
function SessionProbe() {
  token = useAuth().session?.access_token ?? null;
  return null;
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.fetch = vi.fn(async (url: string, init?: RequestInit) =>
    init?.method === "DELETE" ? new Response(null, { status: h.revokeStatus }) : Response.json({ external: {} }));
  h.revokeStatus = 204;
  vi.stubGlobal("fetch", h.fetch);
  h.signOut.mockResolvedValue({ error: null });
  h.sessionsFailed = false;
  h.sessions = [
    session({ id: "current", current: true, browser: "Chrome", platform: "macOS" }),
    session({ id: "laptop", browser: "Firefox", platform: "Windows" }),
  ];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <AuthProvider><SessionProbe /><AccountSecuritySection /></AuthProvider>
    </NextIntlClientProvider>,
  ));
  await act(async () => h.callback!("INITIAL_SESSION", currentSession));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const button = (name: string, scope: ParentNode = host) => {
  const match = [...scope.querySelectorAll("button")].find(b => b.textContent === name);
  if (!match) throw new Error(`No button named ${name}`);
  return match;
};
const dialog = () => host.querySelector<HTMLElement>("[role=alertdialog]");
async function click(target: HTMLElement) {
  await act(async () => { target.click(); });
}
async function rerender() {
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <AuthProvider><SessionProbe /><AccountSecuritySection /></AuthProvider>
    </NextIntlClientProvider>,
  ));
}

it("lists the live sessions and marks this device", async () => {
  h.sessions = [...h.sessions, session({ id: "unknown" })];
  await rerender();
  const rows = [...host.querySelectorAll("li > span")].map(span => span.textContent ?? "");

  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatch(/^Chrome on macOS — This device · Signed in /);
  expect(rows[1]).toMatch(/^Firefox on Windows — Last active .+ · Signed in /);
  expect(rows[2]).toMatch(/^Unknown device — /);
});

it("signs out one other device after confirmation, never this one", async () => {
  const rows = [...host.querySelectorAll("li")];
  expect(rows[0].querySelector("button")).toBeNull();

  await click(button("Sign out", rows[1]));
  expect(dialog()?.textContent).toContain("Sign out Firefox on Windows?");
  await click(button("Sign out", dialog()!));

  const deletes = h.fetch.mock.calls.filter(([, init]) => init?.method === "DELETE");
  expect(deletes.map(([url]) => url)).toEqual(["/api/account/sessions/laptop"]);
  expect(h.signOut).not.toHaveBeenCalled();
  expect(h.toastSuccess).toHaveBeenCalledWith("Firefox on Windows is signed out.");
  expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["auth-sessions"] });
});

it("reports a failed single sign-out", async () => {
  h.revokeStatus = 500;
  await click(button("Sign out", host.querySelectorAll("li")[1]));
  await click(button("Sign out", dialog()!));

  expect(h.toastError).toHaveBeenCalledWith(messages.AccountSecurity.signOutSessionError);
  expect(h.toastSuccess).not.toHaveBeenCalled();
});

it("disables the action when this device is the only session", async () => {
  h.sessions = [session({ id: "current", current: true })];
  await rerender();
  expect(button("Sign out all").disabled).toBe(true);
});

it("keeps the action available when the list cannot be loaded", async () => {
  h.sessions = [];
  h.sessionsFailed = true;
  await rerender();
  expect(host.textContent).toContain(messages.AccountSecurity.sessionsLoadError);
  expect(button("Sign out all").disabled).toBe(false);
});

it("signs out the other sessions once, after confirmation, and keeps this one", async () => {
  await click(button("Sign out all"));
  expect(h.signOut).not.toHaveBeenCalled();
  expect(dialog()?.textContent).toContain(messages.AccountSecurity.signOutOthersConfirmTitle);

  await click(button("Sign out all", dialog()!));

  expect(h.signOut).toHaveBeenCalledTimes(1);
  expect(h.signOut).toHaveBeenCalledWith({ scope: "others" });
  expect(h.toastSuccess).toHaveBeenCalledWith(messages.AccountSecurity.signOutOthersToast);
  expect(dialog()).toBeNull();
  expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["auth-sessions"] });
  expect(token).toBe("token-current");
  expect(h.leaveProtectedScreen).not.toHaveBeenCalled();
});

it("does nothing when the confirmation is cancelled", async () => {
  await click(button("Sign out all"));
  await click(button(messages.Common.cancel, dialog()!));

  expect(dialog()).toBeNull();
  expect(h.signOut).not.toHaveBeenCalled();
});

it("shows the failure in place and leaves the current session signed in", async () => {
  h.signOut.mockResolvedValue({ error: new Error("AuthApiError: session_not_found") });

  await click(button("Sign out all"));
  await click(button("Sign out all", dialog()!));

  expect(h.signOut).toHaveBeenCalledTimes(1);
  expect(host.querySelector("[role=alert]")?.textContent).toBe(messages.AccountSecurity.signOutOthersError);
  expect(h.toastSuccess).not.toHaveBeenCalled();
  expect(token).toBe("token-current");
  expect(h.leaveProtectedScreen).not.toHaveBeenCalled();
  expect(button("Sign out all").disabled).toBe(false);
});
