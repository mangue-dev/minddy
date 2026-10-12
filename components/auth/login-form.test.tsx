// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import messages from "@/messages/en.json";
import { LoginForm } from "./login-form";

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
}));

vi.mock("next/navigation", () => ({
  useRouter: () => state.router,
  useSearchParams: () => state.params,
}));
vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ ...state, oauthProviders: ["google"] }),
}));
vi.mock("@/lib/desktop/bridge", () => ({ isDesktop: () => state.desktop }));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => ({ track: state.track }) }));
vi.mock("@/components/auth/auth-chrome", () => ({
  AuthColumn: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AuthSeparator: () => null,
  Field: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  OAuthButtons: () => null,
  useInDesktopApp: () => state.desktop,
}));
vi.mock("mangue-ui", () => ({
  Button: (props: ComponentProps<"button">) => <button {...props} />,
  Input: (props: ComponentProps<"input">) => <input {...props} />,
  Spinner: () => null,
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
        <LoginForm invite={null} />
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

    expect(host.querySelector("#email")).not.toBeNull();
    expect(host.querySelector("#password")).not.toBeNull();
    expect(host.textContent).not.toContain(messages.Auth.redirecting);
    expect(state.router.replace).not.toHaveBeenCalled();
    if (query.includes("error=")) expect(host.textContent).toContain(messages.Auth.oauthDenied);

    // No INITIAL_SESSION event arrives during the provider's timeout window.
    await act(async () => { await vi.advanceTimersByTimeAsync(7_999); });
    expect(host.querySelector("#email")).not.toBeNull();
    expect(state.router.replace).not.toHaveBeenCalled();

    state.loading = false;
    await render();
    expect(host.querySelector("#email")).not.toBeNull();
    expect(state.router.replace).not.toHaveBeenCalled();
  });

  it.each(["mode=signin", "error=oauth_denied"])(
    "preserves the login screen for %s", async (query) => {
      state.loading = false;
      state.params = new URLSearchParams(query);
      await render();

      expect(state.router.replace).not.toHaveBeenCalled();
      expect(host.querySelector("#email")).not.toBeNull();
    },
  );

  it("keeps signed-out web visitors on the login screen", async () => {
    state.desktop = false;
    state.loading = false;
    await render();

    expect(state.router.replace).not.toHaveBeenCalled();
    expect(host.querySelector("#email")).not.toBeNull();
  });
});
