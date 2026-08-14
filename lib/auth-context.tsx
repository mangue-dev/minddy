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
    options?: { fullName?: string; avatarSeed?: string }
  ) => Promise<{ requiresEmailConfirmation: boolean }>;
  /** Wired for later — OAuth buttons aren't shown in the v1 foundations UI. */
  signInWithOAuth: (
    provider: "google" | "github",
    redirectAfter?: string
  ) => Promise<void>;
  /**
   * Termine une connexion revenue par deep link dans l'app de bureau (MIN-291),
   * et rend la destination où aller ensuite. C'est ICI que le code est échangé,
   * et nulle part ailleurs : le vérificateur PKCE est dans ce stockage-ci.
   */
  completeDesktopSignIn: (link: DesktopAuthLink) => Promise<string>;
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
  /**
   * Enrôlement TOTP (MIN-132) : crée un facteur `unverified` et renvoie de quoi
   * l'afficher — le QR en SVG inline, et le secret pour la saisie manuelle.
   */
  enrollTotp: (friendlyName: string) => Promise<{
    factorId: string;
    qrCode: string;
    secret: string;
  }>;
  /**
   * Présente un code à six chiffres. C'est ce qui vérifie le facteur à
   * l'enrôlement, et ce qui monte la session en `aal2` à chaque connexion —
   * l'API GoTrue est la même dans les deux cas.
   */
  verifyTotp: (factorId: string, code: string) => Promise<void>;
  /** Retire un facteur — utilisé pour nettoyer un enrôlement abandonné. */
  unenrollTotp: (factorId: string) => Promise<void>;
  /** Le premier facteur TOTP du compte, vérifié ou non. */
  firstTotpFactorId: () => Promise<string | null>;
  /**
   * Vrai quand le compte a un facteur vérifié mais que la session est restée en
   * `aal1` — il reste donc un code à présenter. Lecture LOCALE (le JWT et les
   * facteurs de la session), aucun aller-retour réseau.
   */
  needsMfaChallenge: () => Promise<boolean>;
  /**
   * Révoque toutes les AUTRES sessions du compte. Appelé à l'activation de la
   * 2FA : sans ça, un jeton déjà volé resterait valide jusqu'à son propre
   * rafraîchissement, c'est-à-dire précisément ce qu'on vient de vouloir couper.
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
      // ⚠ Bail-out sur le JETON, pas sur l'objet (MIN-315). supabase-js ré-émet
      // `SIGNED_IN` / `TOKEN_REFRESHED` au retour au premier plan et à chaque
      // rafraîchissement de jeton, TOUJOURS avec des objets neufs. Or
      // `AuthProvider` est le provider le plus haut de l'arbre : une session
      // d'identité neuve re-rend tous ses consommateurs, et la cascade est
      // vérifiable de bout en bout — `useProjectsQuery` lit `useAuth`, donc
      // `ProjectsProvider` se re-rend, donc `CreateProvider`, donc le board,
      // donc TOUTES les cartes. Et « au retour au premier plan » est le geste le
      // plus fréquent dans une coquille de bureau.
      setSession((prev) => (prev?.access_token === s?.access_token ? prev : s));
      // ⚠ **Pas de bail-out sur `user`** : `refreshUser` et
      // `updateUserMetadata` s'appuient sur l'identité neuve pour propager les
      // métadonnées.
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
    async (
      email: string,
      password: string,
      options?: { fullName?: string; avatarSeed?: string }
    ) => {
      // Le lien de confirmation s'ouvrira dans le navigateur PAR DÉFAUT, quoi
      // qu'on fasse — un mail ne s'ouvre pas dans Electron. Marqué `desktop=1`,
      // le callback lui renverra le jeton au lieu de le consommer, et c'est
      // l'app qui aura la session (MIN-291). Sans ce marqueur, s'inscrire depuis
      // l'app connecterait le navigateur et laisserait l'app sur son écran de
      // connexion.
      const confirmUrl = new URL(`${window.location.origin}/auth/callback`);
      if (getDesktopBridge()) confirmUrl.searchParams.set(DESKTOP_CALLBACK_FLAG, "1");
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
          emailRedirectTo: confirmUrl.toString(),
          // `avatar_seed` : la marque tirée pendant le wizard (MIN-300). Elle
          // ne peut pas s'écrire dans `user_avatars` maintenant — il n'y a pas
          // encore de compte — donc elle voyage ici, et se pose à la première
          // session (`claimAvatarSeed`).
          data: {
            ...(options?.fullName ? { full_name: options.fullName } : {}),
            ...(options?.avatarSeed ? { avatar_seed: options.avatarSeed } : {}),
          },
        },
      });
      if (error) throw error;
      return { requiresEmailConfirmation: !data.session };
    },
    []
  );

  const signInWithOAuth = useCallback(
    async (provider: "google" | "github", redirectAfter?: string) => {
      const desktop = getDesktopBridge();
      const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
      const safeRedirect = sanitizeInternalRedirectPath(redirectAfter);
      if (safeRedirect !== "/home") {
        callbackUrl.searchParams.set("next", safeRedirect);
      }
      // Le marqueur voyage jusqu'au provider et revient avec lui : c'est la
      // SEULE chose qui dira au callback que la session à ouvrir n'est pas celle
      // du navigateur qui l'appelle (MIN-291).
      if (desktop) {
        callbackUrl.searchParams.set(DESKTOP_CALLBACK_FLAG, "1");
        // Et avec lui le nonce du tour (MIN-345) : au retour, la fenêtre ne
        // traitera le deep link que s'il rapporte celui-ci. Un `minddy://auth`
        // reçu du système, lui, n'en portera aucun.
        callbackUrl.searchParams.set(DESKTOP_TURN_PARAM, beginDesktopAuthTurn());
      }

      const { data, error } = await getSupabase().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl.toString(),
          // Google REFUSE OAuth depuis un navigateur embarqué. Dans l'app, on ne
          // navigue donc pas : on demande l'URL, et le navigateur du système
          // fait le tour. `skipBrowserRedirect` est ce qui rend cette URL au
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
      // Le lien mail n'a PAS été consommé par le callback : il l'a transmis tel
      // quel, précisément pour que la session naisse ici.
      const { error } = await supabase.auth.verifyOtp({
        token_hash: link.tokenHash,
        type: link.type,
      });
      if (error) throw error;
    }
    return link.next;
  }, []);

  const signOut = useCallback(async () => {
    // `scope: "local"` — SANS lui, supabase-js part en portée GLOBALE et révoque
    // les jetons de TOUS les appareils du compte. Se déconnecter de son poste de
    // dev fermait donc aussi la prod, le téléphone et la preview. Fermer une
    // session ferme UNE session ; couper les autres est un geste distinct, et il
    // a déjà son appel (`signOutOtherSessions`, à l'activation de la 2FA).
    const { error } = await getSupabase().auth.signOut({ scope: "local" });
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
    // `challengeAndVerify` = challenge + verify en un aller-retour. Le succès
    // remplace la session courante par une session `aal2` ; `onAuthStateChange`
    // la propage, donc rien à recopier ici.
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

  // La value est MÉMOÏSÉE (MIN-315). Un littéral d'objet ici re-rendrait tous
  // les consommateurs à chaque rendu de ce provider — et c'est le plus haut de
  // l'arbre. Les handlers ci-dessus sont tous des `useCallback` : les seules
  // dépendances qui bougent vraiment sont les trois états.
  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      signInWithPassword,
      signUpWithPassword,
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
      signInWithPassword,
      signUpWithPassword,
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
 * L'utilisateur connecté, ou `null` HORS provider — pour les surfaces qui
 * peuvent être montées des deux côtés de l'authentification.
 *
 * Il y en a maintenant : une page publiée (MIN-283) monte le vrai éditeur de
 * page, donc les vues de nœud de l'éditeur, pour un visiteur anonyme. `useAuth`
 * y lève, et fait tomber la page entière — sur un composant qui ne lisait qu'une
 * préférence de compte. Même parti pris que `useTaskSurface` : hors contexte, la
 * vue rend ce qu'elle peut rendre plutôt que rien.
 */
export function useAuthOptional() {
  return useContext(AuthContext);
}
