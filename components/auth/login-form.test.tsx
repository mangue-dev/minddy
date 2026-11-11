// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import messages from "@/messages/en.json";
import { LoginForm } from "./login-form";
import { SignupWizard } from "./signup-wizard";

const state = vi.hoisted(() => ({
  user: null as User | null,
  loading: true,
  desktop: true,
  params: new URLSearchParams("redirect=%2Fhome"),
  router: { replace: vi.fn(), push: vi.fn() },
  needsMfaChallenge: vi.fn(),
  verifyTotp: vi.fn(),
  firstTotpFactorId: vi.fn(),
  refreshUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  track: vi.fn(),
  oauthProviders: ["google"] as "google"[],
  oauthProvidersResolved: true,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => state.router,
  useSearchParams: () => state.params,
}));
vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => state,
}));
vi.mock("@/lib/desktop/bridge", () => ({ isDesktop: () => state.desktop }));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => ({ track: state.track }) }));
vi.mock("@/components/auth/auth-chrome", () => ({
  AuthColumn: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AuthBackButton: ({ onClick }: { onClick: () => void }) => <button type="button" data-back onClick={onClick}>Back</button>,
  AuthMethodsSkeleton: () => <div data-methods-loading />,
  AUTH_SUBMIT_CLASS: "",
  SubmitArrow: () => null,
  Field: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  OAuthButtons: ({ providers, disabled, onSelect, onEmail }: {
    providers: string[];
    disabled: boolean;
    onSelect: (provider: "google") => void;
    onEmail: () => void;
  }) => providers.length === 0 ? null : (
    <>
      <button type="button" data-oauth disabled={disabled} onClick={() => onSelect("google")}>Google</button>
      <button type="button" data-email-method disabled={disabled} onClick={onEmail}>Email</button>
    </>
  ),
  MailGlyph: () => null,
  PasswordRules: () => null,
  SignupLegalNotice: () => null,
  useInDesktopApp: () => state.desktop,
}));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  MotionConfig: ({ children }: { children: ReactNode }) => children,
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
}));
vi.mock("@/components/wizard/wizard-stepper", () => ({ WizardStepper: () => null }));
vi.mock("@/components/user-avatar-picker", () => ({ UserAvatarPicker: () => null }));
vi.mock("@/lib/use-my-avatar", () => ({ stageSignupAvatarFile: vi.fn() }));
vi.mock("@/components/ui/button", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Button: (props: ComponentProps<"button">) => <button {...props} />,
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

async function render(screen = LoginForm) {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {screen === LoginForm ? <LoginForm invite={null} /> : <SignupWizard invite={null} />}
      </NextIntlClientProvider>,
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  state.user = null;
  state.loading = true;
  state.desktop = true;
  state.params = new URLSearchParams("redirect=%2Fhome");
  state.oauthProviders = ["google"];
  state.oauthProvidersResolved = true;
  state.needsMfaChallenge.mockResolvedValue(true);
  state.firstTotpFactorId.mockResolvedValue("totp-factor");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("desktop login routing", () => {
  it.each([
    { label: "login", screen: LoginForm, desktop: true },
    { label: "signup", screen: SignupWizard, desktop: true },
    { label: "web login", screen: LoginForm, desktop: false },
    { label: "web signup", screen: SignupWizard, desktop: false },
  ])("keeps $label OAuth busy only for the appropriate browser handoff", async ({ screen, desktop }) => {
    state.desktop = desktop;
    state.loading = false;
    state.params = new URLSearchParams("mode=signin");
    let openBrowser!: () => void;
    state.signInWithOAuth.mockImplementationOnce(() => new Promise<void>((resolve) => { openBrowser = resolve; }));
    await render(screen);
    const oauth = host.querySelector<HTMLButtonElement>("[data-oauth]")!;
    await act(() => oauth.click());
    expect(oauth.disabled).toBe(true);
    expect(state.signInWithOAuth).toHaveBeenCalledExactlyOnceWith("google", "/home");
    await act(() => openBrowser());
    // Desktop keeps the renderer open. Returning after abandoning the system
    // browser must allow another provider or password attempt without reloading.
    expect(oauth.disabled).toBe(!desktop);
    if (desktop) {
      await act(() => oauth.click());
      expect(state.signInWithOAuth).toHaveBeenCalledTimes(2);
    }
    expect(state.router.replace).not.toHaveBeenCalled();
    expect(state.router.push).not.toHaveBeenCalled();
  });

  it("waits for session restoration before deciding whether signup is needed", async () => {
    await render();
    expect(state.router.replace).not.toHaveBeenCalled();
    expect(host.querySelector("form")).toBeNull();

    state.user = { id: "google-user" } as User;
    state.loading = false;
    await render();

    expect(host.querySelector("#mfa-code")).not.toBeNull();
    expect(state.router.replace).not.toHaveBeenCalled();
  });

  it("keeps an already restored Google session on the second-factor challenge", async () => {
    state.user = { id: "google-user" } as User;
    state.loading = false;
    await render();

    expect(host.querySelector("#mfa-code")).not.toBeNull();
    expect(state.router.replace).not.toHaveBeenCalled();
    await render();
    expect(state.router.replace).not.toHaveBeenCalled();
  });

  it("leaves the challenge only after verification and preserves the destination", async () => {
    state.user = { id: "google-user" } as User;
    state.loading = false;
    state.params = new URLSearchParams("redirect=%2Fprojects%2Fproject-1%3Fview%3Dboard");
    let finishVerification!: () => void;
    state.verifyTotp.mockImplementation(() => new Promise<void>((resolve) => {
      finishVerification = resolve;
    }));
    await render();

    const input = host.querySelector<HTMLInputElement>("#mfa-code")!;
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "123456");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(() => host.querySelector("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ));
    expect(state.verifyTotp).toHaveBeenCalledWith("totp-factor", "123456");
    expect(state.router.replace).not.toHaveBeenCalled();

    await act(() => finishVerification());
    expect(state.router.replace).toHaveBeenCalledWith("/projects/project-1?view=board");
  });

  it("keeps a failed verification on the challenge without navigating", async () => {
    state.user = { id: "google-user" } as User;
    state.loading = false;
    state.verifyTotp.mockRejectedValue({ code: "mfa_verification_failed" });
    await render();
    await act(() => host.querySelector("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ));

    expect(host.textContent).toContain(messages.Auth.mfaInvalidCode);
    expect(host.querySelector("#mfa-code")).not.toBeNull();
    expect(state.router.replace).not.toHaveBeenCalled();
  });

  it("sends a session that needs no second factor to the requested app route", async () => {
    state.user = { id: "google-user" } as User;
    state.loading = false;
    state.needsMfaChallenge.mockResolvedValue(false);
    await render();

    expect(state.router.replace).toHaveBeenCalledExactlyOnceWith("/home");
    expect(host.querySelector("#mfa-code")).toBeNull();
  });

  it("sends a first-time desktop visitor to signup after initialization", async () => {
    await render();
    expect(state.router.replace).not.toHaveBeenCalled();
    state.loading = false;
    await render();

    expect(state.router.replace).toHaveBeenCalledExactlyOnceWith("/signup?redirect=%2Fhome");
  });

  it.each([
    { label: "web login", desktop: false, query: "" },
    { label: "explicit desktop sign-in", desktop: true, query: "mode=signin" },
    { label: "desktop OAuth error", desktop: true, query: "error=oauth_denied" },
  ])("keeps $label available while session initialization is delayed", async ({ desktop, query }) => {
    vi.useFakeTimers();
    state.desktop = desktop;
    state.params = new URLSearchParams(query);
    await render();

    expect(host.querySelector("[data-email-method]")).not.toBeNull();
    expect(host.textContent).not.toContain(messages.Auth.redirecting);
    expect(state.router.replace).not.toHaveBeenCalled();
    if (query.includes("error=")) expect(host.textContent).toContain(messages.Auth.oauthDenied);

    // No INITIAL_SESSION event arrives during the provider's timeout window.
    await act(async () => { await vi.advanceTimersByTimeAsync(7_999); });
    expect(host.querySelector("[data-email-method]")).not.toBeNull();
    expect(state.router.replace).not.toHaveBeenCalled();

    state.loading = false;
    await render();
    expect(host.querySelector("[data-email-method]")).not.toBeNull();
    expect(state.router.replace).not.toHaveBeenCalled();
  });

  it.each(["mode=signin", "error=oauth_denied", "redirect=%2Fhome&session=expired"])(
    "preserves the login screen for %s", async (query) => {
      state.loading = false;
      state.params = new URLSearchParams(query);
      await render();

      expect(state.router.replace).not.toHaveBeenCalled();
      expect(host.querySelector("[data-email-method]")).not.toBeNull();
    },
  );

  it("explains an expired session only when the app sent the user here for it", async () => {
    state.desktop = false;
    state.loading = false;
    await render();
    expect(host.textContent).not.toContain(messages.Auth.sessionExpired);
    state.params = new URLSearchParams("redirect=%2Fhome&session=expired");
    await render();
    expect(host.querySelector('[role="status"]')?.textContent).toBe(messages.Auth.sessionExpired);
  });

  it("keeps signed-out web visitors on the login screen", async () => {
    state.desktop = false;
    state.loading = false;
    await render();

    expect(state.router.replace).not.toHaveBeenCalled();
    expect(host.querySelector("[data-email-method]")).not.toBeNull();
  });
});

describe("sign-in methods", () => {
  beforeEach(() => {
    state.desktop = false;
    state.loading = false;
  });

  it.each([
    { label: "login", screen: LoginForm },
    { label: "signup", screen: SignupWizard },
  ])("lists the methods on $label and opens the email form in their place", async ({ screen }) => {
    await render(screen);
    expect(host.querySelector("[data-oauth]")).not.toBeNull();
    expect(host.querySelector('input[type="email"]:not([hidden])')).toBeNull();

    await act(() => host.querySelector<HTMLButtonElement>("[data-email-method]")!.click());
    expect(host.querySelector("[data-oauth]")).toBeNull();
    expect(host.querySelector('input[type="email"]')).not.toBeNull();

    await act(() => host.querySelector<HTMLButtonElement>("[data-back]")!.click());
    expect(host.querySelector("[data-oauth]")).not.toBeNull();
    expect(host.querySelector('input[type="email"]')).toBeNull();
  });

  it.each([
    { label: "login", screen: LoginForm },
    { label: "signup", screen: SignupWizard },
  ])("shows the email form at once on $label when the server has no provider", async ({ screen }) => {
    state.oauthProviders = [];
    await render(screen);
    expect(host.querySelector('input[type="email"]')).not.toBeNull();
    // Nothing to go back to.
    expect(host.querySelector("[data-back]")).toBeNull();
  });

  it.each([
    { label: "login", screen: LoginForm },
    { label: "signup", screen: SignupWizard },
  ])("waits on $label for the server to say which methods it offers", async ({ screen }) => {
    state.oauthProviders = [];
    state.oauthProvidersResolved = false;
    await render(screen);
    expect(host.querySelector("[data-methods-loading]")).not.toBeNull();
    expect(host.querySelector('input[type="email"]')).toBeNull();
  });

  it("signs in with a password from the email form", async () => {
    state.needsMfaChallenge.mockResolvedValue(false);
    state.signInWithPassword.mockResolvedValue(undefined);
    await render(LoginForm);
    await act(() => host.querySelector<HTMLButtonElement>("[data-email-method]")!.click());
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(state.signInWithPassword).toHaveBeenCalledOnce();
    expect(state.router.push).toHaveBeenCalledWith("/home");
  });
});
