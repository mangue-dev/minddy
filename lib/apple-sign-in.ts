/**
 * Sign in with Apple (MIN-907, App Review guideline 4.8), client side.
 *
 * On the web and the desktop app, Apple is one more OAuth provider of
 * `signInWithOAuth`. Inside the iOS app it is native: the shell shows
 * Apple's own sheet (`mobile/ios/App/App/AppleSignIn.swift`) and returns an
 * identity token with the raw nonce it was issued for. The page opens its
 * session with `signInWithIdToken`, so no browser round and no callback are
 * involved. The Supabase Apple provider must list the app's bundle
 * identifier among its client IDs.
 *
 * Two things a native sign-in carries are kept on the way:
 * - the person's name, which Apple gives once and never again, becomes the
 *   account's display name when it has none (`lib/display-name.ts`);
 * - the one-time authorization code, which the server exchanges for the token
 *   it revokes when the account is deleted (`lib/server/apple-sign-in.ts`).
 * Both are best-effort: losing either must not undo a successful sign-in.
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AuthNameMeta } from "@/lib/display-name";
import type { MobileShellPlugin } from "./mobile/bridge";

export type NativeAppleShell = MobileShellPlugin & {
  signInWithApple: NonNullable<MobileShellPlugin["signInWithApple"]>;
};

/** The shell when it can show the native sheet, `null` otherwise. */
export function nativeAppleShell(
  shell: MobileShellPlugin | null | undefined,
): NativeAppleShell | null {
  return shell && typeof shell.signInWithApple === "function"
    ? (shell as NativeAppleShell)
    : null;
}

/** True when Apple is one of the account's sign-in methods. */
export function hasAppleIdentity(user: Pick<User, "app_metadata" | "identities"> | null | undefined): boolean {
  if (!user) return false;
  if (user.identities?.some((identity) => identity.provider === "apple")) return true;
  const providers = (user.app_metadata as { providers?: unknown } | undefined)?.providers;
  return Array.isArray(providers) && providers.includes("apple");
}

/** True when the account already has a name of its own. */
function hasAuthName(meta: AuthNameMeta | null | undefined): boolean {
  return !!(meta?.display_name?.trim() || meta?.full_name?.trim() || meta?.name?.trim());
}

export type NativeAppleOutcome = { kind: "signed-in"; user: User } | { kind: "closed" };

export async function signInWithNativeApple(
  shell: NativeAppleShell,
  supabase: Pick<SupabaseClient, "auth">,
  saveAuthorization: (authorizationCode: string) => Promise<void> = saveAppleAuthorization,
): Promise<NativeAppleOutcome> {
  const credential = await shell.signInWithApple();
  if (!credential.identityToken || !credential.nonce) return { kind: "closed" };

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: credential.nonce,
  });
  if (error) throw error;
  if (!data.user) throw new Error("Apple sign-in returned no account");

  let user = data.user;
  const fullName = credential.fullName?.trim();
  if (fullName && !hasAuthName(user.user_metadata as AuthNameMeta)) {
    try {
      const updated = await supabase.auth.updateUser({ data: { full_name: fullName } });
      if (updated.data.user) user = updated.data.user;
    } catch (err) {
      console.error("[mobile] apple display name not saved:", err);
    }
  }

  if (credential.authorizationCode) {
    try {
      await saveAuthorization(credential.authorizationCode);
    } catch (err) {
      console.error("[mobile] apple authorization not saved:", err);
    }
  }
  return { kind: "signed-in", user };
}

/**
 * Hands Apple's authorization to the server, which keeps a token it can
 * revoke when the account is deleted. `authorizationCode` comes from the iOS
 * app; `refreshToken` from a web round, where Supabase returns it once.
 */
export async function saveAppleAuthorization(
  authorizationCode: string | null,
  refreshToken: string | null = null,
): Promise<void> {
  const response = await fetch("/api/account/apple-sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      authorizationCode ? { authorizationCode } : { refreshToken },
    ),
  });
  if (!response.ok) throw new Error(`Apple authorization refused (${response.status})`);
}
