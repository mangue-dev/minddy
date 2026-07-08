"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { getSupabase } from "./supabase";
import { sanitizeInternalRedirectPath } from "./auth-redirect";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (
    email: string,
    password: string,
    options?: {
      fullName?: string;
      redirectAfter?: string;
    }
  ) => Promise<{ requiresEmailConfirmation: boolean }>;
  /** Wired for later — OAuth buttons aren't shown in the v1 foundations UI. */
  signInWithOAuth: (
    provider: "google" | "github",
    redirectAfter?: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (attributes: {
    password?: string;
    data?: Record<string, unknown>;
  }) => Promise<void>;
  /**
   * Re-pull the account from Supabase Auth into local state. Needed when
   * `user_metadata` changes OUTSIDE the client session — e.g. Numo editing the
   * account settings server-side via the admin API, which fires no client auth
   * event, so the UI would otherwise keep reading the stale JWT.
   */
  refreshUser: () => Promise<void>;
}

// Safety net: if Supabase is unreachable, onAuthStateChange may never fire
// INITIAL_SESSION and the app would hang on `loading`. Bail out after this.
const AUTH_INIT_TIMEOUT_MS = 8_000;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    let resolved = false;

    const timeoutId = window.setTimeout(() => {
      if (resolved) return;
      setLoading(false);
    }, AUTH_INIT_TIMEOUT_MS);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      resolved = true;
      window.clearTimeout(timeoutId);
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    return () => {
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

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
      options?: {
        fullName?: string;
        redirectAfter?: string;
      }
    ) => {
      const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
      const redirectAfter = sanitizeInternalRedirectPath(options?.redirectAfter);
      if (redirectAfter !== "/home") {
        callbackUrl.searchParams.set("next", redirectAfter);
      }

      const { data, error } = await getSupabase().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: callbackUrl.toString(),
          ...(options?.fullName ? { data: { full_name: options.fullName } } : {}),
        },
      });
      if (error) throw error;
      return { requiresEmailConfirmation: !data.session };
    },
    []
  );

  const signInWithOAuth = useCallback(
    async (provider: "google" | "github", redirectAfter?: string) => {
      const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
      const safeRedirect = sanitizeInternalRedirectPath(redirectAfter);
      if (safeRedirect !== "/home") {
        callbackUrl.searchParams.set("next", safeRedirect);
      }
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl.toString() },
      });
      if (error) throw error;
    },
    []
  );

  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
    window.location.href = "/login";
  }, []);

  const updateUser = useCallback(
    async (attributes: { password?: string; data?: Record<string, unknown> }) => {
      const { data, error } = await getSupabase().auth.updateUser(attributes);
      if (error) throw error;
      if (data.user) setUser(data.user);
    },
    []
  );

  const refreshUser = useCallback(async () => {
    const supabase = getSupabase();
    // refreshSession mints a new JWT carrying the current user_metadata (so a
    // later reload / server request also sees the change) and updates state.
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.user) {
      setUser(data.user);
      if (data.session) setSession(data.session);
      return;
    }
    // Fallback: fetch the fresh account without a token refresh.
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) setUser(userData.user);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signInWithPassword,
        signUpWithPassword,
        signInWithOAuth,
        signOut,
        updateUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
