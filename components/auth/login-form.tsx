"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, Input, Spinner, cn, toast } from "mangue-ui";
import { Github, UserPlus } from "lucide-react";
import { MinddyLogo } from "@/components/minddy-logo";
import { MfaChallenge } from "@/components/auth/mfa-challenge";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";
import { getAppEnv, ENV_LOGO_TINT } from "@/lib/env";
import { AuthShader } from "@/components/auth-shader";
import { useAuth } from "@/lib/auth-context";
import { getDesktopBridge, isDesktop } from "@/lib/desktop/bridge";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import { useAnalytics } from "@/lib/use-analytics";
import { errorReason } from "@/lib/analytics-sanitize";
import type { InvitationPreview } from "@/lib/types";

/** Logo Google multicolore (inline — pas d'asset externe). */
function GoogleGlyph() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/** La marque, avec ou sans lien vers le site public. */
function LogoMark({ asLink }: { asLink: boolean }) {
  const mark = (
    <>
      <MinddyLogo
        className={cn("h-7 w-auto text-foreground", ENV_LOGO_TINT[getAppEnv()])}
      />
      <span className="font-display text-lg font-semibold tracking-tight">
        minddy
      </span>
    </>
  );
  const className = "inline-flex w-fit items-center gap-2 rounded-sm";
  return asLink ? (
    <Link
      href="/"
      aria-label="minddy"
      className={cn(
        className,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {mark}
    </Link>
  ) : (
    <div className={className}>{mark}</div>
  );
}

/**
 * Les mentions légales sous le bouton d'inscription — CGU et confidentialité.
 *
 * **Dans l'app de bureau, elles ouvrent le NAVIGATEUR** (MIN-292) : la fenêtre
 * ne montre que l'authentification et l'app, et une page publique n'y entre pas.
 * La coquille a bien un garde-fou pour ça, mais il agit APRÈS coup — une
 * navigation SPA n'est pas annulable, il ne peut que ramener à l'entrée, et il
 * jetterait ce formulaire à moitié rempli. Le geste juste est donc de ne pas
 * naviguer du tout.
 *
 * Ça reste un vrai `<a href>` : le lien est copiable, ouvrable au milieu, et
 * lisible par un lecteur d'écran comme n'importe quel autre.
 */
function LegalLink({
  href,
  external,
  children,
}: {
  href: string;
  external: boolean;
  children: React.ReactNode;
}) {
  const className = "underline underline-offset-4 hover:text-foreground";
  if (!external) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        // Absolue, et bâtie sur l'origine COURANTE : en développement la
        // coquille pointe sur `localhost`, et un lien vers la production
        // ouvrirait la mauvaise page.
        getDesktopBridge()?.openExternal(new URL(href, window.location.origin).href);
      }}
    >
      {children}
    </a>
  );
}

type OAuthProvider = "google" | "github";

export function LoginForm({ invite }: { invite: InvitationPreview | null }) {
  const t = useTranslations("Auth");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    user,
    signInWithPassword,
    signUpWithPassword,
    signInWithOAuth,
    needsMfaChallenge,
    refreshUser,
  } = useAuth();
  const { track } = useAnalytics();

  const redirectTo = sanitizeInternalRedirectPath(searchParams.get("redirect"));
  // Arriver par un lien d'invitation, c'est très majoritairement ne pas avoir
  // de compte (MIN-197) : l'écran s'ouvre sur l'inscription. Un `?mode=` reste
  // prioritaire, et la bascule connexion/inscription est à un clic.
  const [isSignUp, setIsSignUp] = useState(
    searchParams.get("mode") === "signup" ||
      (invite !== null && searchParams.get("mode") !== "signin")
  );

  const [fullName, setFullName] = useState("");
  // L'adresse invitée est celle à laquelle le mail est arrivé : c'est ELLE qui
  // rattache la personne au projet, pas le token du lien. La pré-remplir évite
  // la faute qui coûte le plus cher ici — s'inscrire avec une autre adresse et
  // ne rien voir venir.
  const [email, setEmail] = useState(invite?.invitedEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
  const [notice, setNotice] = useState<string | null>(null);
  // Lu APRÈS le montage : `window.minddy` n'existe pas au rendu serveur, et le
  // supposer ferait diverger l'hydratation.
  const [inDesktopApp, setInDesktopApp] = useState(false);
  useEffect(() => setInDesktopApp(isDesktop()), []);

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
    setNotice(null);

    if (isSignUp && password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setLoading(true);
    track(isSignUp ? "signup_submitted" : "login_submitted", isSignUp ? {} : { method: "password" });
    try {
      if (isSignUp) {
        const { requiresEmailConfirmation } = await signUpWithPassword(
          email,
          password,
          { fullName: fullName.trim() || undefined }
        );
        track("signup_succeeded", {
          requires_email_confirmation: requiresEmailConfirmation,
        });
        if (requiresEmailConfirmation) {
          setNotice(t("confirmationSent", { email }));
          setIsSignUp(false);
          setPassword("");
          setConfirmPassword("");
          return;
        }
      } else {
        await signInWithPassword(email, password);
        track("login_succeeded", { method: "password" });
        // Mot de passe accepté, mais la session est en `aal1` : le challenge
        // prend la place du formulaire (MIN-132). Naviguer d'abord ferait un
        // aller-retour visible par le proxy, qui nous renverrait ici.
        if (await needsMfaChallenge()) {
          setMfaStep("required");
          return;
        }
      }
      router.push(redirectTo);
    } catch (err) {
      // On envoie une CATÉGORIE, jamais le message : il peut porter l'email.
      const reason = errorReason(err);
      if (isSignUp) track("signup_failed", { reason });
      else track("login_failed", { method: "password", reason });
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setError(null);
    setNotice(null);
    setOauthPending(provider);
    track("oauth_initiated", { provider, context: isSignUp ? "signup" : "login" });
    try {
      // Succès = la page navigue vers le provider ; on ne repasse jamais ici.
      await signInWithOAuth(provider, redirectTo);
    } catch (err) {
      track("login_failed", { method: provider, reason: errorReason(err) });
      setError((err as Error).message);
      setOauthPending(null);
    }
  };

  const toggleMode = () => {
    setIsSignUp((v) => !v);
    setError(null);
    setNotice(null);
  };

  return (
    <div className="grid min-h-[100dvh] grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
      {/* Gauche — fond animé « grain gradient » (Paper Shaders), bleus minddy */}
      <div className="relative hidden overflow-hidden bg-background lg:block">
        <AuthShader />
      </div>

      {/* Droite — formulaire d'auth */}
      <div className="relative flex flex-col p-8">
        {/* Logo — coin haut-gauche du panneau, ramène à l'accueil. Dans l'app de
            bureau il ne ramène nulle part : le site public n'y a pas de place, et
            un lien qui rebondirait aussitôt vers ici vaut moins qu'une marque
            posée (MIN-291). */}
        <LogoMark asLink={!inDesktopApp} />

        <div className="flex flex-1 items-center justify-center">
          {mfaStep === "required" ? (
            <MfaChallenge
              onVerified={() => router.replace(redirectTo)}
              onRecovered={async () => {
                // La 2FA vient d'être coupée : rafraîchir le jeton avant de
                // partir, sinon le proxy lit encore l'ancien drapeau et renvoie
                // ici — une boucle, juste après avoir brûlé un code.
                await refreshUser();
                toast.success(t("mfaDisabledNotice"));
                router.replace(redirectTo);
              }}
            />
          ) : mfaStep === "unknown" ? (
            <Spinner className="size-6" />
          ) : (
          <div className="w-full max-w-[380px] space-y-8">
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
                {isSignUp ? t("createAccount") : t("welcomeBack")}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {isSignUp ? t("signupSubtitle") : t("loginSubtitle")}
              </p>
            </div>

            {/* Connexion via un provider — même bouton pour se connecter et
                s'inscrire : Supabase crée le compte au premier passage. */}
            <div className="space-y-2.5">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full justify-center gap-2.5"
                disabled={busy}
                onClick={() => void handleOAuth("google")}
              >
                {oauthPending === "google" ? <Spinner /> : <GoogleGlyph />}
                {t("continueWithGoogle")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full justify-center gap-2.5"
                disabled={busy}
                onClick={() => void handleOAuth("github")}
              >
                {oauthPending === "github" ? (
                  <Spinner />
                ) : (
                  <Github className="size-4" />
                )}
                {t("continueWithGitHub")}
              </Button>
            </div>

            {/* Séparateur */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-3 text-muted-foreground">
                  {t("orContinueWithEmail")}
                </span>
              </div>
            </div>

            {notice && <p className="text-sm text-emerald-600">{notice}</p>}

            {/* Formulaire email */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="space-y-1.5">
                  <label htmlFor="full-name" className="text-sm font-medium">
                    {t("fullName")}
                  </label>
                  <Input
                    id="full-name"
                    type="text"
                    className="h-10 bg-card"
                    autoComplete="name"
                    placeholder={t("fullNamePlaceholder")}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">
                  {t("email")}
                </label>
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
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  {t("password")}
                </label>
                <Input
                  id="password"
                  type="password"
                  className="h-10 bg-card"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  placeholder={
                    isSignUp
                      ? t("passwordPlaceholderSignUp")
                      : t("passwordPlaceholder")
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {isSignUp && (
                <div className="space-y-1.5">
                  <Input
                    id="confirm-password"
                    type="password"
                    className="h-10 bg-card"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    aria-label={t("confirmPassword")}
                    placeholder={t("confirmPasswordPlaceholder")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                disabled={busy}
                className="h-10 w-full justify-center gap-2"
              >
                {loading && <Spinner />}
                {isSignUp ? t("createAccount") : t("signIn")}
              </Button>

              {/* Mention d'information au point de collecte (RGPD art. 13,
                  MIN-119). Elle vit sous le bouton d'inscription et nulle part
                  ailleurs : c'est ici que des données sont collectées pour la
                  première fois, une connexion ne collecte rien de neuf. */}
              {isSignUp && (
                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  {t.rich("signupLegalNotice", {
                    terms: (chunks) => (
                      <LegalLink
                        href={localizedHref("/terms", locale)}
                        external={inDesktopApp}
                      >
                        {chunks}
                      </LegalLink>
                    ),
                    privacy: (chunks) => (
                      <LegalLink
                        href={localizedHref("/privacy", locale)}
                        external={inDesktopApp}
                      >
                        {chunks}
                      </LegalLink>
                    ),
                  })}
                </p>
              )}
            </form>

            {/* Bascule inscription / connexion */}
            <p className="text-center text-sm text-muted-foreground">
              {isSignUp ? t("alreadyHaveAccount") : t("noAccountYet")}{" "}
              <button
                type="button"
                onClick={toggleMode}
                disabled={busy}
                className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-60"
              >
                {isSignUp ? t("signIn") : t("createAccountLink")}
              </button>
            </p>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
