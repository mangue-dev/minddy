"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner, toast } from "mangue-ui";
import { UserPlus } from "lucide-react";
import { MfaChallenge } from "@/components/auth/mfa-challenge";
import {
  AuthColumn,
  AuthSeparator,
  Field,
  OAuthButtons,
  useInDesktopApp,
  type OAuthProvider,
} from "@/components/auth/auth-chrome";
import { useAuth } from "@/lib/auth-context";
import { isDesktop } from "@/lib/desktop/bridge";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import { preserveAuthParams } from "@/lib/signup-wizard";
import { useAnalytics } from "@/lib/use-analytics";
import { errorReason } from "@/lib/analytics-sanitize";
import { authErrorMessage } from "@/lib/auth-errors";
import type { InvitationPreview } from "@/lib/types";

/**
 * La connexion, et rien d'autre (MIN-300).
 *
 * L'écran portait les deux intentions — se connecter, s'inscrire — dans un même
 * formulaire à bascule, sur une page à deux colonnes dont la moitié gauche était
 * un shader WebGL. Il ne reste que ce qu'on vient y faire : une colonne centrée,
 * deux providers, une adresse, un mot de passe. L'inscription a sa propre route
 * ([signup-wizard.tsx](signup-wizard.tsx)), et le lien du bas y mène en gardant
 * la destination et l'invitation en cours.
 *
 * Le fond animé est parti avec, et rien ne l'a remplacé : voir l'en-tête de
 * `app/(auth)/auth-shell.tsx` pour ce qui a été essayé et pourquoi.
 */
export function LoginForm({ invite }: { invite: InvitationPreview | null }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    user,
    signInWithPassword,
    signInWithOAuth,
    needsMfaChallenge,
    refreshUser,
  } = useAuth();
  const { track } = useAnalytics();
  const inDesktopApp = useInDesktopApp();

  const redirectTo = sanitizeInternalRedirectPath(searchParams.get("redirect"));
  const signUpHref = `/signup${preserveAuthParams(searchParams)}`;

  const [email, setEmail] = useState(invite?.invitedEmail ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Provider en cours de redirection — la page part vers Google/GitHub, donc cet
  // état n'est jamais remis à null en cas de succès (seulement sur erreur).
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);
  const authErrorMessages: Record<string, string> = {
    auth_callback_failed: t("callbackFailed"),
    confirmation_failed: t("confirmationFailed"),
    oauth_denied: t("oauthDenied"),
    oauth_failed: t("oauthFailed"),
  };
  const [error, setError] = useState<string | null>(
    authErrorMessages[searchParams.get("error") ?? ""] ?? null
  );

  /**
   * **Dans l'app de bureau, l'entrée est l'INSCRIPTION** (MIN-292, MIN-300).
   *
   * Quelqu'un qui vient de télécharger 120 Mo et de faire glisser une icône dans
   * Applications n'a, très majoritairement, pas encore de compte. Or la fenêtre
   * s'ouvre sur `/home`, et le proxy renvoie ici faute de session : sans ce
   * détour, le premier écran du produit serait un formulaire de connexion, et il
   * faudrait trouver le lien du bas avant de pouvoir commencer.
   *
   * `?mode=signin` le désactive, et c'est ce que porte le lien « j'ai déjà un
   * compte » du wizard : un choix explicite n'a pas à être défait par un défaut.
   * Un `?error=` le désactive aussi — l'écran a alors quelque chose à DIRE
   * (« connexion annulée », « ce lien a expiré »), et partir ailleurs
   * l'emporterait sans que personne l'ait lu.
   *
   * Le test se fait dans un effet — `window.minddy` n'existe pas côté serveur,
   * et le supposer ferait diverger l'hydratation.
   */
  const modeParam = searchParams.get("mode");
  const errorParam = searchParams.get("error");
  const [redirectingToSignup, setRedirectingToSignup] = useState(false);
  useEffect(() => {
    if (modeParam === "signin" || errorParam || !isDesktop()) return;
    setRedirectingToSignup(true);
    router.replace(signUpHref);
  }, [modeParam, errorParam, router, signUpHref]);

  // Une seule tentative de connexion à la fois (email OU provider).
  const busy = loading || oauthPending !== null;

  /**
   * Second facteur (MIN-132). `unknown` = on n'a pas encore regardé — donc on
   * n'affiche ni le formulaire ni le challenge, sinon l'un des deux clignote à
   * chaque retour de Google. `required` = la session existe mais reste en
   * `aal1` : c'est le proxy qui nous a renvoyés ici, et cet écran EST la suite.
   */
  const [mfaStep, setMfaStep] = useState<"unknown" | "none" | "required">("unknown");

  // Already authenticated (e.g. session restored) → leave the auth screen, à
  // moins qu'il reste un facteur à présenter.
  useEffect(() => {
    if (!user) {
      setMfaStep("none");
      return;
    }
    let cancelled = false;
    void (async () => {
      const required = await needsMfaChallenge();
      if (cancelled) return;
      if (required) setMfaStep("required");
      else {
        setMfaStep("none");
        router.replace(redirectTo);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router, redirectTo, needsMfaChallenge]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    track("login_submitted", { method: "password" });
    try {
      await signInWithPassword(email, password);
      track("login_succeeded", { method: "password" });
      // Mot de passe accepté, mais la session est en `aal1` : le challenge
      // prend la place du formulaire (MIN-132). Naviguer d'abord ferait un
      // aller-retour visible par le proxy, qui nous renverrait ici.
      if (await needsMfaChallenge()) {
        setMfaStep("required");
        return;
      }
      router.push(redirectTo);
    } catch (err) {
      // Le refus brut dans la console : on n'affiche qu'une phrase, or c'est
      // le `code` et le statut HTTP qui permettent de diagnostiquer. Sans ça,
      // un refus qu'on ne sait pas encore traduire ne laisse aucune trace —
      // l'appel part du navigateur vers Supabase, il n'y a rien côté Vercel.
      console.error("[login] refus de Supabase Auth:", err);
      // On envoie une CATÉGORIE, jamais le message : il peut porter l'email.
      track("login_failed", { method: "password", reason: errorReason(err) });
      // Traduit quand on sait le faire : « Invalid login credentials » est le
      // refus le plus fréquent du produit, et il arrivait en anglais.
      setError(authErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setError(null);
    setOauthPending(provider);
    track("oauth_initiated", { provider, context: "login" });
    try {
      // Succès = la page navigue vers le provider ; on ne repasse jamais ici.
      await signInWithOAuth(provider, redirectTo);
    } catch (err) {
      track("login_failed", { method: provider, reason: errorReason(err) });
      setError(authErrorMessage(err, t));
      setOauthPending(null);
    }
  };

  return (
    <AuthColumn inDesktopApp={inDesktopApp}>
      {mfaStep === "required" ? (
        <MfaChallenge
          onVerified={() => router.replace(redirectTo)}
          onRecovered={async () => {
            // La 2FA vient d'être coupée : rafraîchir le jeton avant de partir,
            // sinon le proxy lit encore l'ancien drapeau et renvoie ici — une
            // boucle, juste après avoir brûlé un code.
            await refreshUser();
            toast.success(t("mfaDisabledNotice"));
            router.replace(redirectTo);
          }}
        />
      ) : mfaStep === "unknown" || redirectingToSignup ? (
        <div className="flex justify-center">
          <Spinner className="size-6" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Le bandeau d'invitation (MIN-197). Il ne fait qu'ANNONCER : rien
              ici ne rattache la personne au projet — c'est l'email vérifié de
              sa session qui s'en charge, à /auth/callback. */}
          {invite && (
            <div className="flex gap-3 rounded-lg border border-border bg-card p-3.5">
              <UserPlus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium leading-snug">
                  {t("inviteBannerTitle", {
                    actor: invite.inviterName || t("inviteBannerSomeone"),
                    project: invite.projectName,
                  })}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("inviteBannerBody", { email: invite.invitedEmail })}
                </p>
              </div>
            </div>
          )}

          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {t("welcomeBack")}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("loginSubtitle")}
            </p>
          </div>

          <OAuthButtons
            pending={oauthPending}
            disabled={busy}
            onSelect={(provider) => void handleOAuth(provider)}
          />

          <AuthSeparator label={t("orContinueWithEmail")} />

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field id="email" label={t("email")}>
              <Input
                id="email"
                type="email"
                className="h-10 bg-card"
                autoComplete="email"
                required
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field id="password" label={t("password")}>
              <Input
                id="password"
                type="password"
                className="h-10 bg-card"
                autoComplete="current-password"
                required
                minLength={8}
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              disabled={busy}
              className="h-10 w-full justify-center gap-2"
            >
              {loading && <Spinner />}
              {t("signIn")}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {t("noAccountYet")}{" "}
            <Link
              href={signUpHref}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("createAccountLink")}
            </Link>
          </p>
        </div>
      )}
    </AuthColumn>
  );
}
