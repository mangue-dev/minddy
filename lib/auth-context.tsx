"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { getSupabase } from "./supabase";
import { sanitizeInternalRedirectPath } from "./auth-redirect";
import { clearPersistedQueryCache } from "./query-provider";
import { useAnalytics } from "./use-analytics";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (
    email: string,
    password: string,
    options?: { fullName?: string }
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
   * Écrit un patch dans `user_metadata` de façon MERGE-SAFE et SÉRIALISÉE. Les
   * toggles de réglages écrivent chacun un champ ; sans sérialisation, deux
   * toggles rapides lisent le même métadata de base et le dernier écrase le
   * champ de l'autre. Ici chaque écriture est chaînée et fusionne le patch dans
   * le métadonnées le plus frais — les toggles peuvent donc rester optimistes et
   * NON verrouillés (plus de `disabled` pendant la sauvegarde GoTrue). Rejette
   * si l'écriture échoue, pour que l'appelant puisse revert son état optimiste.
   */
  updateUserMetadata: (patch: Record<string, unknown>) => Promise<void>;
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
  const { track, identify, reset } = useAnalytics();

  // Snapshot du user le plus frais, lu par updateUserMetadata pour fusionner sur
  // la bonne base (le state en closure serait périmé dans une chaîne d'écritures).
  const userRef = useRef<User | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  // Chaîne d'écritures métadonnées sérialisées (voir updateUserMetadata).
  const metaWriteChain = useRef<Promise<void>>(Promise.resolve());

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
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);

      // Analytics (MIN-78) : rattache les événements suivants au compte. Les
      // événements d'inscription/connexion eux-mêmes sont émis par le SERVEUR
      // (app/auth/callback), qui distingue de façon fiable une première
      // connexion — l'heuristique client « compte créé il y a moins d'une
      // minute » d'AutoKap a été abandonnée pour cette raison.
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
    async (email: string, password: string, options?: { fullName?: string }) => {
      const { data, error } = await getSupabase().auth.signUp({
        email,
        password,
        options: {
          // Pas de `?next=` ici (MIN-117) : c'est le TEMPLATE d'email GoTrue qui
          // pose la destination finale (/auth/confirmed). Ce qui se joue dans
          // cette URL, c'est l'ORIGINE — dev et previews doivent recevoir un lien
          // vers la leur, pas vers la prod. GoTrue ne la retient que si elle
          // figure dans l'allowlist « Redirect URLs » ; sinon il retombe sur le
          // Site URL, et le lien de confirmation part vers le mauvais domaine.
          emailRedirectTo: `${window.location.origin}/auth/callback`,
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
    // Le cache React Query est persisté sur disque (MIN-89) : sans purge, le
    // compte suivant sur cette machine réhydraterait les données de celui-ci
    // avant que ses propres requêtes n'aboutissent.
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
    // Chaîne : chaque écriture attend la précédente puis fusionne son patch dans
    // le métadonnées le PLUS frais (userRef, mis à jour synchroniquement ici pour
    // que le maillon suivant parte de la bonne base). La chaîne survit à un échec
    // (catch) mais l'appelant, lui, voit le rejet et peut revert.
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
        updateUserMetadata,
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
