import { describe, expect, it, vi } from "vitest";
import { hasAppleIdentity, nativeAppleShell, signInWithNativeApple, type NativeAppleShell } from "./apple-sign-in";

/**
 * Sign in with Apple in the iOS app (MIN-907): the identity token opens the
 * session, and what Apple gives only once is not lost on the way.
 */

function supabaseWith(meta: Record<string, unknown>) {
  const user = { id: "u1", user_metadata: meta, app_metadata: {} };
  const auth = {
    signInWithIdToken: vi.fn(async () => ({ data: { user, session: {} }, error: null })),
    updateUser: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      data: { user: { ...user, user_metadata: { ...meta, ...data } } },
      error: null,
    })),
  };
  return { auth } as never as { auth: typeof auth };
}

const shellReturning = (credential: Record<string, string>) =>
  nativeAppleShell({ signInWithApple: async () => credential } as never) as NativeAppleShell;

describe("signInWithNativeApple", () => {
  it("opens the session with the token and the raw nonce, then saves the name and the code", async () => {
    const supabase = supabaseWith({});
    const save = vi.fn(async () => {});
    const outcome = await signInWithNativeApple(
      shellReturning({ identityToken: "jwt", nonce: "raw", authorizationCode: "code", fullName: "Camille Roy" }),
      supabase as never,
      save,
    );

    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({ provider: "apple", token: "jwt", nonce: "raw" });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ data: { full_name: "Camille Roy" } });
    expect(save).toHaveBeenCalledWith("code");
    expect(outcome.kind).toBe("signed-in");
  });

  it("keeps a name the account already has", async () => {
    const supabase = supabaseWith({ full_name: "Camille" });
    await signInWithNativeApple(
      shellReturning({ identityToken: "jwt", nonce: "raw", fullName: "Someone Else" }),
      supabase as never,
      vi.fn(async () => {}),
    );
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("does nothing when the sheet is closed", async () => {
    const supabase = supabaseWith({});
    expect(await signInWithNativeApple(shellReturning({}), supabase as never)).toEqual({ kind: "closed" });
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it("keeps the session when the code cannot be saved", async () => {
    const supabase = supabaseWith({});
    const outcome = await signInWithNativeApple(
      shellReturning({ identityToken: "jwt", nonce: "raw", authorizationCode: "code" }),
      supabase as never,
      async () => { throw new Error("offline"); },
    );
    expect(outcome.kind).toBe("signed-in");
  });
});

describe("hasAppleIdentity", () => {
  it("reads the identities, then the provider list", () => {
    expect(hasAppleIdentity({ identities: [{ provider: "apple" }], app_metadata: {} } as never)).toBe(true);
    expect(hasAppleIdentity({ identities: [], app_metadata: { providers: ["google", "apple"] } } as never)).toBe(true);
    expect(hasAppleIdentity({ identities: [{ provider: "google" }], app_metadata: { providers: ["google"] } } as never)).toBe(false);
    expect(hasAppleIdentity(null)).toBe(false);
  });

  it("finds no native sheet in an older shell", () => {
    expect(nativeAppleShell({} as never)).toBeNull();
    expect(nativeAppleShell(null)).toBeNull();
  });
});
