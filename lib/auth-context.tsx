"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { getSupabase } from "./supabase";
import { sanitizeInternalRedirectPath } from "./auth-redirect";
import { getDesktopBridge } from "./desktop/bridge";
import { DESKTOP_CALLBACK_FLAG, DESKTOP_TURN_PARAM } from "./desktop/config";
import { beginDesktopAuthTurn } from "./desktop/auth-turn";
import type { DesktopAuthLink } from "./desktop/auth-link";
import { clearPersistedQueryCache } from "./query-provider";
import { readInterfaceLocale } from "./interface-locale";
import { useAnalytics } from "./use-analytics";
import { browserRuntimeConfig } from "./runtime-config-provider";
import type { User, Session } from "@supabase/supabase-js";

export type OAuthProvider = "google" | "github";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  oauthProviders: OAuthProvider[];
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (
    email: string,
    password: string,
    options?: { fullName?: string; avatarSeed?: string }
  ) => Promise<{ requiresEmailConfirmation: boolean }>;
  /**
   * Sends the password reset link (MIN-297). NEVER say
   * if the address has an account: GoTrue responds the same way in both cases,
   * and the screen displays the same sentence — a form that distinguishes the two is
   * a revealer of accounts.
   */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Starts an OAuth sign-in flow for an enabled Supabase external provider. */
  signInWithOAuth: (
    provider: OAuthProvider,
    redirectAfter?: string
  ) => Promise<void>;
  /**
   * Terminates a connection returned by deep link in the desktop app (MIN-291),
   * and makes the destination where to go next. This is where the code is exchanged,
   * and nowhere else: the PKCE verifier is in this storage.
   */
  completeDesktopSignIn: (link: DesktopAuthLink) => Promise<string>;
  signOut: () => Promise<void>;
  updateUser: (attributes: {
    password?: string;
    data?: Record<string, unknown>;
  }) => Promise<void>;
  /**
   * Writes a patch to `user_metadata` in a MERGE-SAFE and SERIALIZED manner. THE
   * settings toggles each write a field; without serialization, two
   * quick toggles read the same base metadata and the last one overwrites the
   * field of the other. Here each write is chained and merges the patch into
   * the freshest metadata — so toggles can remain optimistic and
   * NOT locked (more than `disabled` during GoTrue backup). Rejects
   * if the write fails, so the caller can return to its optimistic state.
   */
  updateUserMetadata: (patch: Record<string, unknown>) => Promise<void>;
  /**
   * Re-pull the account from Supabase Auth into local state. Needed when
   * `user_metadata` changes OUTSIDE the client session — e.g. Numo editing the
   * account settings server-side via the admin API, which fires no client auth
   * event, so the UI would otherwise keep reading the stale JWT.
   */
  refreshUser: () => Promise<void>;
  /**
   * TOTP enrollment (MIN-132): creates a factor `unverified` and returns what
   * display it — the QR in SVG inline, and the secret for manual entry.
   */
  enrollTotp: (friendlyName: string) => Promise<{
    factorId: string;
    qrCode: string;
    secret: string;
  }>;
  /**
   * Presents a six-digit code. This is what checks the factor
   * enrollment, and what sets the session to `aal2` at each connection —
   * the GoTrue API is the same in both cases.
   */
  verifyTotp: (factorId: string, code: string) => Promise<void>;
  /** Removes a Postman — used to clean up an abandoned enlistment. */
  unenrollTotp: (factorId: string) => Promise<void>;
  /** The first TOTP factor of the account, verified or not. */
  firstTotpFactorId: () => Promise<string | null>;
  /**
   * True when the account has a verified factor but the session remains in
   * `aal1` — there is therefore one code left to present. LOCAL reading (the JWT and the
   * session factors), no network round trip.
   */
  needsMfaChallenge: () => Promise<boolean>;
  /**
   * Revokes all OTHER sessions from the account. Called for activation of the
   * 2FA: without this, an already stolen token would remain valid until its own
   * refreshment, that is to say precisely what we just wanted to cut.
   */
  signOutOtherSessions: () => Promise<void>;
}

// Safety net: if Supabase is unreachable, onAuthStateChange may never fire
// INITIAL_SESSION and the app would hang on `loading`. Bail out after this.
const AUTH_INIT_TIMEOUT_MS = 8_000;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const { track, identify, reset } = useAnalytics();

  // Snapshot of freshest user, read by updateUserMetadata to merge on
  // the correct basis (the state in closure would be out of date in a chain of writes).
  const userRef = useRef<User | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  // String of serialized metadata writes (see updateUserMetadata).
  const metaWriteChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const { supabaseUrl, supabaseAnonKey } = browserRuntimeConfig();
    const controller = new AbortController();

    void fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const body: unknown = await response.json();
        const external =
          typeof body === "object" && body !== null && "external" in body
            ? (body as { external?: unknown }).external
            : null;
        if (!external || typeof external !== "object") return;
        setOauthProviders(
          (["google", "github"] as const).filter(
            (provider) => (external as Record<string, unknown>)[provider] === true,
          ),
        );
      })
      .catch(() => {
        // A failed settings check must not expose buttons that cannot work.
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    let resolved = false;

    const timeoutId = window.setTimeout(() => {
      if (resolved) return;
      setLoading(false);
    }, AUTH_INIT_TIMEOUT_MS);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      resolved = true;
      window.clearTimeout(timeoutId);
      // ⚠ Bail-out on the TOKEN, not on the item (MIN-315). supabase-js re-issues
      // `SIGNED_IN` / `TOKEN_REFRESHED` when returning to the foreground and each time
      // token refresh, ALWAYS with new objects. Gold
      // `AuthProvider` is the highest provider in the tree: a session
      // new identity re-makes all its consumers, and the cascade is
      // verifiable end-to-end — `useProjectsQuery` reads `useAuth`, so
      // `ProjectsProvider` returns, therefore `CreateProvider`, therefore the board,
      // so ALL the cards. And “when returning to the foreground” is the gesture
      // more common in an office shell.
      setSession((prev) => (prev?.access_token === s?.access_token ? prev : s));
      // ⚠ **No bail-out on `user`**: `refreshUser` and
      // `updateUserMetadata` rely on the new identity to propagate the
      // metadata.
      setUser(s?.user ?? null);
      setLoading(false);

      // Analytics (MIN-78): attaches the following events to the account. THE
      // registration/login events themselves are emitted by the SERVER
      // (app/auth/callback), which reliably distinguishes a first
      // connection — the customer heuristic “account created less than a year ago
      // minute” from AutoKap was abandoned for this reason.
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && s?.user) {
        identify(
          s.user.id,
          {
            email: s.user.email,
            name: (s.user.user_metadata?.full_name as string | undefined) ?? null,
          },
          {
            signup_date: s.user.created_at,
            signup_method: s.user.app_metadata?.provider ?? "email",
          }
        );
      } else if (event === "SIGNED_OUT") {
        track("user_signed_out", {});
        reset();
      }
    });

    return () => {
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [identify, reset, track]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signUpWithPassword = useCallback(
    async (
      email: string,
      password: string,
      options?: { fullName?: string; avatarSeed?: string }
    ) => {
      // The confirmation link will open in the DEFAULT browser, what
      // what we do — an email does not open in Electron. Marked `desktop=1`,
      // the callback will return the token to it instead of consuming it, and that's
      // the app that will have the session (MIN-291). Without this marker, register from
      // the app would connect the browser and leave the app on its screen
      // connexion.
      const confirmUrl = new URL(`${window.location.origin}/auth/callback`);
      if (getDesktopBridge()) confirmUrl.searchParams.set(DESKTOP_CALLBACK_FLAG, "1");
      const { data, error } = await getSupabase().auth.signUp({
        email,
        password,
        options: {
          // No `?next=` here (MIN-117): this is the GoTrue email TEMPLATE which
          // sets the final destination (/auth/confirmed). What is at stake in
          // this URL is the ORIGIN — dev and previews must receive a link
          // towards theirs, not towards production. GoTrue only retains it if it
          // appears in the “Redirect URLs” allowlist; otherwise it falls back on the
          // Site URL, and the confirmation link goes to the wrong domain.
          emailRedirectTo: confirmUrl.toString(),
          // `avatar_seed`: the mark drawn during the wizard (MIN-300). She
          // cannot be written in `user_avatars` now — there is no
          // still counting — so she travels here, and lands at the first
          // session (`claimAvatarSeed`).
          data: {
            ...(options?.fullName ? { full_name: options.fullName } : {}),
            ...(options?.avatarSeed ? { avatar_seed: options.avatarSeed } : {}),
            // `locale`: the language of the interface at the time of registration.
            // This is what the GoTrue template of the confirmation email will read
            // — the very first sending of the account, and the only one that leaves BEFORE
            // that a session could have put anything together. Without this field,
            // this email comes out in English no matter what.
            locale: readInterfaceLocale(),
          },
        },
      });
      if (error) throw error;
      return { requiresEmailConfirmation: !data.session };
    },
    []
  );

  const sendPasswordReset = useCallback(async (email: string) => {
    // Same URL as the registration confirmation, and for the same reasons:
    // it is the ORIGIN that is at stake here (dev, preview or prod), and the marker
    // `desktop=1` passes the token back to the app instead of connecting the
    // system browser (MIN-291). The final DESTINATION is posed by
    // the email template — `next=/reset-password` (MIN-117, MIN-297): nothing
    // what we add here in query does not survive the GoTrue allowlist.
    const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
    if (getDesktopBridge()) callbackUrl.searchParams.set(DESKTOP_CALLBACK_FLAG, "1");
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl.toString(),
    });
    if (error) throw error;
  }, []);

  const signInWithOAuth = useCallback(
    async (provider: "google" | "github", redirectAfter?: string) => {
      const desktop = getDesktopBridge();
      const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
      const safeRedirect = sanitizeInternalRedirectPath(redirectAfter);
      if (safeRedirect !== "/home") {
        callbackUrl.searchParams.set("next", safeRedirect);
      }
      // The marker travels to the provider and returns with it: this is the
      // ONLY thing that will tell the callback that the session to open is not the one
      // du navigateur qui l'appelle (MIN-291).
      if (desktop) {
        callbackUrl.searchParams.set(DESKTOP_CALLBACK_FLAG, "1");
        // And with him the nuncio of the tour (MIN-345): on the return, the window does not
        // will process the deep link only if it reports it. A `minddy://auth`
        // received from the system, he will not carry any.
        callbackUrl.searchParams.set(DESKTOP_TURN_PARAM, beginDesktopAuthTurn());
      }

      const { data, error } = await getSupabase().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl.toString(),
          // Google REFUSES OAuth from an embedded browser. In the app, we do not
          // therefore do not navigate: we ask for the URL, and the system browser
          // goes around. `skipBrowserRedirect` is what makes this URL au
          // lieu de nous y envoyer.
          ...(desktop ? { skipBrowserRedirect: true } : {}),
        },
      });
      if (error) throw error;
      if (desktop && data?.url) desktop.openExternal(data.url);
    },
    []
  );

  const completeDesktopSignIn = useCallback(async (link: DesktopAuthLink) => {
    const supabase = getSupabase();
    if (link.kind === "error") throw new Error(link.error);
    if (link.kind === "code") {
      const { error } = await supabase.auth.exchangeCodeForSession(link.code);
      if (error) throw error;
    } else {
      // The email link was NOT consumed by the callback: it transmitted it as
      // which, precisely so that the session is born here.
      const { error } = await supabase.auth.verifyOtp({
        token_hash: link.tokenHash,
        type: link.type,
      });
      if (error) throw error;
    }
    return link.next;
  }, []);

  const signOut = useCallback(async () => {
    // `scope: "local"` — WITHOUT it, supabase-js goes GLOBAL in scope and revokes
    // tokens from ALL devices in the account. Disconnect from your workstation
    // dev therefore also closed production, telephone and preview. Close one
    // session closes ONE session; cutting off others is a distinct gesture, and it
    // already has its call (`signOutOtherSessions`, upon activation of 2FA).
    const { error } = await getSupabase().auth.signOut({ scope: "local" });
    if (error) throw error;
    // The React Query cache is persisted on disk (MIN-89): without purging, the
    // next account on this machine would rehydrate the data of this one
    // before his own requests are successful.
    clearPersistedQueryCache();
    window.location.href = "/login";
  }, []);

  const updateUser = useCallback(
    async (attributes: { password?: string; data?: Record<string, unknown> }) => {
      const { data, error } = await getSupabase().auth.updateUser(attributes);
      if (error) throw error;
      if (data.user) {
        userRef.current = data.user;
        setUser(data.user);
      }
    },
    []
  );

  const updateUserMetadata = useCallback((patch: Record<string, unknown>) => {
    // Chain: each write waits for the previous one then merges its patch into
    // the MOST fresh metadata (userRef, updated synchronously here to
    // that the next link starts from the correct base). The channel survives a failure
    // (catch) but the caller sees the rejection and can revert.
    const run = metaWriteChain.current.then(async () => {
      const currentMeta = (userRef.current?.user_metadata ?? {}) as Record<
        string,
        unknown
      >;
      const { data, error } = await getSupabase().auth.updateUser({
        data: { ...currentMeta, ...patch },
      });
      if (error) throw error;
      if (data.user) {
        userRef.current = data.user;
        setUser(data.user);
      }
    });
    metaWriteChain.current = run.catch(() => {});
    return run;
  }, []);

  // Paste `user_metadata.locale` onto the interface language.
  //
  // This field is NOT used by the app — it reads the `NEXT_LOCALE` cookie. It serves
  // to authentication emails, delivered by GoTrue without request or cookie:
  // `user_metadata` is all it knows about the recipient (see
  // `lib/interface-locale.ts` and `supabase/email-templates/`). The setting of
  // language of preferences already writes it itself; the other paths, no —
  // the public footer selector, Numo setting the language on the server side,
  // an OAuth connection, and any accounts created before this field existed.
  //
  // Hence this refresher course at each session: a complete writing
  // first time, nothing after that (the comparison cuts it short). This is what
  // which repairs the existing fleet — but only when the account reopens the app,
  // which leaves a requested password reset by then to go
  // en anglais.
  useEffect(() => {
    if (!user) return;
    const wanted = readInterfaceLocale();
    if (user.user_metadata?.locale === wanted) return;
    void updateUserMetadata({ locale: wanted }).catch(() => {});
  }, [user, updateUserMetadata]);

  const refreshUser = useCallback(async () => {
    const supabase = getSupabase();
    // refreshSession mints a new JWT carrying the current user_metadata (so a
    // later reload / server request also sees the change) and updates state.
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.user) {
      userRef.current = data.user;
      setUser(data.user);
      if (data.session) setSession(data.session);
      return;
    }
    // Fallback: fetch the fresh account without a token refresh.
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      userRef.current = userData.user;
      setUser(userData.user);
    }
  }, []);

  const enrollTotp = useCallback(async (friendlyName: string) => {
    const { data, error } = await getSupabase().auth.mfa.enroll({
      factorType: "totp",
      friendlyName,
    });
    if (error) throw error;
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
  }, []);

  const verifyTotp = useCallback(async (factorId: string, code: string) => {
    // `challengeAndVerify` = challenge + verify in one round trip. Success
    // replaces the current session with a `aal2` session; `onAuthStateChange`
    // propagates it, so nothing to copy here.
    const { error } = await getSupabase().auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error) throw error;
  }, []);

  const unenrollTotp = useCallback(async (factorId: string) => {
    const { error } = await getSupabase().auth.mfa.unenroll({ factorId });
    if (error) throw error;
  }, []);

  const firstTotpFactorId = useCallback(async () => {
    const { data, error } = await getSupabase().auth.mfa.listFactors();
    if (error) throw error;
    return data.totp[0]?.id ?? null;
  }, []);

  const needsMfaChallenge = useCallback(async () => {
    const { data, error } =
      await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.currentLevel === "aal1" && data.nextLevel === "aal2";
  }, []);

  const signOutOtherSessions = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut({ scope: "others" });
    if (error) throw error;
  }, []);

  // The value is STORED (MIN-315). An object literal here would re-render all
  // consumers with each rendering of this provider — and it is the highest of
  // the tree. The handlers above are all `useCallback`: the only ones
  // Dependencies that really move are the three states.
  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      oauthProviders,
      signInWithPassword,
      signUpWithPassword,
      sendPasswordReset,
      signInWithOAuth,
      completeDesktopSignIn,
      signOut,
      updateUser,
      updateUserMetadata,
      refreshUser,
      enrollTotp,
      verifyTotp,
      unenrollTotp,
      firstTotpFactorId,
      needsMfaChallenge,
      signOutOtherSessions,
    }),
    [
      user,
      session,
      loading,
      oauthProviders,
      signInWithPassword,
      signUpWithPassword,
      sendPasswordReset,
      signInWithOAuth,
      completeDesktopSignIn,
      signOut,
      updateUser,
      updateUserMetadata,
      refreshUser,
      enrollTotp,
      verifyTotp,
      unenrollTotp,
      firstTotpFactorId,
      needsMfaChallenge,
      signOutOtherSessions,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * The logged in user, or `null` OUTSIDE provider — for surfaces that
 * can be mounted on both sides of the authentication.
 *
 * There is now: a published page (MIN-283) mounts the real editor of
 * page, therefore the editor node views, for an anonymous visitor. `useAuth`
 * y lifts, and drops the entire page — on a component that only read one
 * account preference. Same bias as `useTaskSurface`: out of context, the
 * view renders what it can render rather than nothing.
 */
export function useAuthOptional() {
  return useContext(AuthContext);
}
