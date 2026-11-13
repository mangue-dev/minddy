// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import messages from "@/messages/en.json";
import { AuthEntry } from "./auth-entry";

const state = vi.hoisted(() => ({
  user: null as User | null,
  loading: false,
  desktop: false,
  preview: false,
  params: new URLSearchParams("redirect=%2Fhome"),
  router: { replace: vi.fn(), push: vi.fn() },
  lookupAccount: vi.fn(),
  needsMfaChallenge: vi.fn(),
  verifyTotp: vi.fn(),
  firstTotpFactorId: vi.fn(),
  refreshUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  track: vi.fn(),
  oauthProviders: ["apple", "google"] as ("apple" | "google")[],
  oauthProvidersResolved: true,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => state.router,
  useSearchParams: () => state.params,
}));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => state }));
vi.mock("@/lib/auth-entry", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  lookupAccount: (email: string) => state.lookupAccount(email),
}));
vi.mock("@/lib/env", () => ({ isPreviewEnv: () => state.preview, signupHref: () => "https://www.minddy.app/signup" }));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => ({ track: state.track }) }));
vi.mock("@/components/auth/auth-chrome", () => ({
  AuthColumn: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AuthBackButton: ({ onClick }: { onClick: () => void }) => <button type="button" data-back onClick={onClick}>Back</button>,
  AuthMethodsSkeleton: () => <div data-methods-loading />,
  AUTH_SUBMIT_CLASS: "",
  OAuthButtons: ({ providers, disabled, onSelect }: { providers: string[]; disabled: boolean; onSelect: (provider: string) => void }) =>
    providers.map((provider) => <button key={provider} type="button" data-oauth={provider} disabled={disabled} onClick={() => onSelect(provider)}>{provider}</button>),
  OrDivider: () => <hr />,
  MailGlyph: () => null,
  PasswordRules: () => null,
  SelfHostButton: () => null,
  SignupLegalNotice: () => null,
  useInDesktopApp: () => state.desktop,
}));
vi.mock("@/components/ui/button", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Button: ({ asChild: _asChild, ...props }: ComponentProps<"button"> & { asChild?: boolean }) => <button {...props} />,
}));
vi.mock("@/components/ui/input", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Input: (props: ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@/components/ui/spinner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Spinner: () => null,
}));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { success: vi.fn() },
}));
vi.mock("@/components/otp-input", () => ({
  OtpInput: ({ onChange, onComplete: _onComplete, ...props }: Omit<ComponentProps<"input">, "onChange"> & {
    onChange: (value: string) => void;
    onComplete: (value: string) => void;
  }) => <input {...props} onChange={(event) => onChange(event.target.value)} />,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render() {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AuthEntry invite={null} />
      </NextIntlClientProvider>,
    );
  });
}

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submit() {
  await act(async () => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function enterEmail(email = "ana@example.com") {
  await act(() => type(host.querySelector<HTMLInputElement>("#email")!, email));
  await submit();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  state.user = null;
  state.desktop = false;
  state.preview = false;
  state.params = new URLSearchParams("redirect=%2Fhome");
  state.oauthProviders = ["apple", "google"];
  state.oauthProvidersResolved = true;
  state.needsMfaChallenge.mockResolvedValue(false);
  state.firstTotpFactorId.mockResolvedValue("totp-factor");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("the address step", () => {
  it("asks for the address above the sign-in services, Apple first", async () => {
    await render();
    expect(host.querySelector("h1")?.textContent).toBe(messages.Auth.entryTitle);
    const email = host.querySelector("#email")!;
    const services = [...host.querySelectorAll("[data-oauth]")].map((button) => button.getAttribute("data-oauth"));
    expect(services).toEqual(["apple", "google"]);
    expect(email.compareDocumentPosition(host.querySelector("[data-oauth]")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("refuses an address that is not one, without asking the server", async () => {
    await render();
    await enterEmail("ana");
    expect(host.textContent).toContain(messages.Auth.emailInvalid);
    expect(state.lookupAccount).not.toHaveBeenCalled();
  });

  it("waits for the server to say which services it offers", async () => {
    state.oauthProviders = [];
    state.oauthProvidersResolved = false;
    await render();
    expect(host.querySelector("[data-methods-loading]")).not.toBeNull();
    expect(host.querySelector("#email")).not.toBeNull();
  });

  it("shows a refused lookup on the address step", async () => {
    state.lookupAccount.mockResolvedValue({ failure: "errorRateLimited" });
    await render();
    await enterEmail();
    expect(host.textContent).toContain(messages.Auth.errorRateLimited);
    expect(host.querySelector("#email")).not.toBeNull();
  });

  it("explains an expired session only when the app sent the person here for it", async () => {
    await render();
    expect(host.textContent).not.toContain(messages.Auth.sessionExpired);
    state.params = new URLSearchParams("redirect=%2Fhome&session=expired");
    await render();
    expect(host.querySelector('[role="status"]')?.textContent).toBe(messages.Auth.sessionExpired);
  });

  it("shows the error a provider sent the person back with", async () => {
    state.params = new URLSearchParams("error=oauth_denied");
    await render();
    expect(host.textContent).toContain(messages.Auth.oauthDenied);
  });
});

describe("after the address", () => {
  it("asks an existing account for its password and signs in", async () => {
    state.lookupAccount.mockResolvedValue({ status: "password" });
    state.signInWithPassword.mockResolvedValue(undefined);
    await render();
    await enterEmail();
    expect(host.querySelector("h1")?.textContent).toBe(messages.Auth.passwordTitle);
    expect(host.textContent).toContain("ana@example.com");
    await act(() => type(host.querySelector<HTMLInputElement>("#password")!, "Secret-123"));
    await submit();
    expect(state.signInWithPassword).toHaveBeenCalledWith("ana@example.com", "Secret-123");
    expect(state.router.push).toHaveBeenCalledWith("/home");
  });

  it("asks a new address for a password and nothing else, then waits for its confirmation", async () => {
    state.lookupAccount.mockResolvedValue({ status: "new" });
    state.signUpWithPassword.mockResolvedValue({ requiresEmailConfirmation: true });
    await render();
    await enterEmail();
    expect(host.querySelector("h1")?.textContent).toBe(messages.Auth.signupPasswordTitle);
    expect(host.querySelectorAll("input:not([hidden])")).toHaveLength(1);
    await act(() => type(host.querySelector<HTMLInputElement>("#password")!, "Secret-123"));
    await submit();
    expect(state.signUpWithPassword).toHaveBeenCalledWith("ana@example.com", "Secret-123");
    expect(host.querySelector("h1")?.textContent).toBe(messages.Auth.signupConfirmTitle);
  });

  it("keeps a new account from a password the policy refuses", async () => {
    state.lookupAccount.mockResolvedValue({ status: "new" });
    await render();
    await enterEmail();
    await act(() => type(host.querySelector<HTMLInputElement>("#password")!, "short"));
    await submit();
    expect(state.signUpWithPassword).not.toHaveBeenCalled();
    expect(host.textContent).toContain(messages.Auth.passwordPolicy);
  });

  it("says sign-ups are closed on preview instead of a form bound to fail", async () => {
    state.preview = true;
    state.lookupAccount.mockResolvedValue({ status: "new" });
    await render();
    await enterEmail();
    expect(host.textContent).toContain(messages.PreviewEnvironment.signupClosedTitle);
    expect(host.querySelector("#password")).toBeNull();
  });

  it("points an account without a password to its sign-in service", async () => {
    state.lookupAccount.mockResolvedValue({ status: "oauth" });
    await render();
    await enterEmail();
    expect(host.querySelector("h1")?.textContent).toBe(messages.Auth.oauthOnlyTitle);
    expect(host.querySelector("[data-oauth]")).not.toBeNull();
    expect(host.querySelector("#password")).toBeNull();
  });

  it("goes back to the address it was given", async () => {
    state.lookupAccount.mockResolvedValue({ status: "password" });
    await render();
    await enterEmail();
    await act(() => host.querySelector<HTMLButtonElement>("[data-back]")!.click());
    expect(host.querySelector<HTMLInputElement>("#email")!.value).toBe("ana@example.com");
  });
});

describe("sessions and providers", () => {
  it.each([
    { label: "desktop", desktop: true },
    { label: "web", desktop: false },
  ])("keeps a provider busy only for the $label handoff", async ({ desktop }) => {
    state.desktop = desktop;
    let openBrowser!: () => void;
    state.signInWithOAuth.mockImplementationOnce(() => new Promise<void>((resolve) => { openBrowser = resolve; }));
    await render();
    const apple = host.querySelector<HTMLButtonElement>('[data-oauth="apple"]')!;
    await act(() => apple.click());
    expect(apple.disabled).toBe(true);
    expect(state.signInWithOAuth).toHaveBeenCalledExactlyOnceWith("apple", "/home");
    await act(() => openBrowser());
    expect(apple.disabled).toBe(!desktop);
  });

  it("keeps a restored session on the second-factor challenge until it is verified", async () => {
    state.user = { id: "google-user" } as User;
    state.needsMfaChallenge.mockResolvedValue(true);
    state.params = new URLSearchParams("redirect=%2Fprojects%2Fproject-1%3Fview%3Dboard");
    state.verifyTotp.mockResolvedValue(undefined);
    await render();
    const input = host.querySelector<HTMLInputElement>("#mfa-code")!;
    expect(input).not.toBeNull();
    expect(state.router.replace).not.toHaveBeenCalled();
    await act(() => type(input, "123456"));
    await submit();
    expect(state.verifyTotp).toHaveBeenCalledWith("totp-factor", "123456");
    expect(state.router.replace).toHaveBeenCalledWith("/projects/project-1?view=board");
  });

  it("sends a session that needs no second factor to the requested route", async () => {
    state.user = { id: "google-user" } as User;
    await render();
    expect(state.router.replace).toHaveBeenCalledExactlyOnceWith("/home");
  });
});
