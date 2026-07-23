"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner, cn } from "mangue-ui";
import { Github } from "lucide-react";
import { MinddyLogo } from "@/components/minddy-logo";
import { getAppEnv, ENV_LOGO_TINT } from "@/lib/env";
import { AuthShader } from "@/components/auth-shader";
import { useAuth } from "@/lib/auth-context";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";

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

type OAuthProvider = "google" | "github";

function LoginForm() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, signInWithPassword, signUpWithPassword, signInWithOAuth } = useAuth();

  const redirectTo = sanitizeInternalRedirectPath(searchParams.get("redirect"));
  const [isSignUp, setIsSignUp] = useState(searchParams.get("mode") === "signup");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Provider en cours de redirection — la page part vers Google/GitHub, donc cet
  // état n'est jamais remis à null en cas de succès (seulement sur erreur).
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);
  const authErrorMessages: Record<string, string> = {
    auth_callback_failed: t("callbackFailed"),
    oauth_denied: t("oauthDenied"),
    oauth_failed: t("oauthFailed"),
  };
  const [error, setError] = useState<string | null>(
    authErrorMessages[searchParams.get("error") ?? ""] ?? null
  );
  const [notice, setNotice] = useState<string | null>(null);

  // Une seule tentative de connexion à la fois (email OU provider).
  const busy = loading || oauthPending !== null;

  // Already authenticated (e.g. session restored) → leave the auth screen.
  useEffect(() => {
    if (user) router.replace(redirectTo);
  }, [user, router, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (isSignUp && password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { requiresEmailConfirmation } = await signUpWithPassword(
          email,
          password,
          { fullName: fullName.trim() || undefined, redirectAfter: redirectTo }
        );
        if (requiresEmailConfirmation) {
          setNotice(t("confirmationSent", { email }));
          setIsSignUp(false);
          setPassword("");
          setConfirmPassword("");
          return;
        }
      } else {
        await signInWithPassword(email, password);
      }
      router.push(redirectTo);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setError(null);
    setNotice(null);
    setOauthPending(provider);
    try {
      // Succès = la page navigue vers le provider ; on ne repasse jamais ici.
      await signInWithOAuth(provider, redirectTo);
    } catch (err) {
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
        {/* Logo — coin haut-gauche du panneau, ramène à l'accueil */}
        <Link
          href="/"
          aria-label="minddy"
          className="inline-flex w-fit items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MinddyLogo
            className={cn("h-7 w-auto text-foreground", ENV_LOGO_TINT[getAppEnv()])}
          />
          <span className="font-display text-lg font-semibold tracking-tight">
            minddy
          </span>
        </Link>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[380px] space-y-8">
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
                    className="h-10"
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
                  className="h-10"
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
                  className="h-10"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  required
                  minLength={6}
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
                    className="h-10"
                    autoComplete="new-password"
                    required
                    minLength={6}
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
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner className="size-6" />}>
      <LoginForm />
    </Suspense>
  );
}
