// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { beginDesktopAuthTurn } from "@/lib/desktop/auth-turn";
import { mobileAuthShell, runMobileAuthSession, type MobileAuthShell } from "./auth-session";

const PROVIDER = "https://example.supabase.co/auth/v1/authorize?provider=google";

function shellAnswering(url?: string): MobileAuthShell {
  return { authenticate: vi.fn(async () => (url ? { url } : {})) };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("mobileAuthShell", () => {
  it("is null for a shell that cannot run a sign-in sheet", () => {
    expect(mobileAuthShell(null)).toBeNull();
    expect(mobileAuthShell({} as never)).toBeNull();
  });
});

describe("runMobileAuthSession", () => {
  it("opens the provider page and waits for the minddy scheme", async () => {
    const shell = shellAnswering();
    await runMobileAuthSession(shell, PROVIDER);
    expect(shell.authenticate).toHaveBeenCalledWith({ url: PROVIDER, callbackScheme: "minddy" });
  });

  it("returns the code of the turn the app started", async () => {
    const turn = beginDesktopAuthTurn();
    const outcome = await runMobileAuthSession(
      shellAnswering(`minddy://auth?code=abc&next=%2Fprojects&turn=${turn}`),
      PROVIDER,
    );
    expect(outcome).toEqual({
      kind: "link",
      link: { kind: "code", code: "abc", next: "/projects", turn },
    });
  });

  it("refuses a code that does not carry the turn's nonce", async () => {
    beginDesktopAuthTurn();
    await expect(
      runMobileAuthSession(shellAnswering("minddy://auth?code=abc&turn=other"), PROVIDER),
    ).rejects.toThrow("auth_callback_failed");
  });

  it("reports a closed sheet and forgets the turn", async () => {
    const turn = beginDesktopAuthTurn();
    expect(await runMobileAuthSession(shellAnswering(), PROVIDER)).toEqual({ kind: "cancelled" });
    // The same nonce no longer opens a session after the round was given up.
    await expect(
      runMobileAuthSession(shellAnswering(`minddy://auth?code=abc&turn=${turn}`), PROVIDER),
    ).rejects.toThrow("auth_callback_failed");
  });

  it("passes the provider's refusal on", async () => {
    beginDesktopAuthTurn();
    const outcome = await runMobileAuthSession(
      shellAnswering("minddy://auth?error=access_denied&reason=oauth_denied"),
      PROVIDER,
    );
    expect(outcome).toEqual({
      kind: "link",
      link: { kind: "error", error: "access_denied", reason: "oauth_denied" },
    });
  });
});
