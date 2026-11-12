"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon, UserAdd01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { RedirectingScreen } from "@/components/auth/redirecting-screen";
import { MobileWelcome } from "@/components/auth/mobile-welcome";
import { MfaChallenge } from "@/components/auth/mfa-challenge";
import {
  AUTH_SUBMIT_CLASS,
  AuthBackButton,
  AuthColumn,
  AuthMethodsSkeleton,
  MailGlyph,
  OAuthButtons,
  OrDivider,
  PasswordRules,
  SelfHostButton,
  SignupLegalNotice,
  SubmitArrow,
  useInDesktopApp,
  type OAuthProvider,
} from "@/components/auth/auth-chrome";
import { useAuth } from "@/lib/auth-context";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import { isValidEmail, lookupAccount, preserveAuthParams, type AccountStatus } from "@/lib/auth-entry";
import { authErrorMessage } from "@/lib/auth-errors";
import { errorReason } from "@/lib/analytics-sanitize";
import { isPreviewEnv, signupHref } from "@/lib/env";
import { isNativeMobile } from "@/lib/mobile/bridge";
import { useNativeMobile } from "@/lib/native-app";
import { passwordMeetsPolicy } from "@/lib/password-policy";
import { SESSION_EXPIRED_PARAM, SESSION_EXPIRED_VALUE } from "@/lib/signed-out-redirect";
import { useAnalytics } from "@/lib/use-analytics";
import type { InvitationPreview } from "@/lib/types";

/**
 * Sign-in and sign-up, one screen (MIN-907), on every platform.
 *
 * The address comes first, with the sign-in services under it. Once the
 * address is given, the server says what it holds (`lib/auth-entry.ts`), and
 * the screen asks for the account's password, for a new password, or points
 * an account created through a sign-in service back to it. A new account
 * needs only its address and its password: its name and its picture are
 * chosen in the app, after the first sign-in.
 *
 * `/login` and `/signup` both show it; the route only says which screen an
 * old link meant.
 */
/** The welcome screen was passed in this app session (MIN-907). */
const WELCOME_SEEN_KEY = "minddy:welcome-seen";

function welcomeSeen(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(WELCOME_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberWelcomeSeen() {
  try {
    window.sessionStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    // Without storage the welcome shows again after a reload: harmless.
  }
}

type Step = "email" | Exclude<AccountStatus, "new"> | "create" | "closed" | "confirm";

export function AuthEntry({ invite }: { invite: InvitationPreview | null }) {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const tPreview = useTranslations("PreviewEnvironment");
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    user,
    oauthProviders,
    oauthProvidersResolved,
    signInWithPassword,
    signUpWithPassword,
    signInWithOAuth,
    needsMfaChallenge,
    refreshUser,
  } = useAuth();
  const { track } = useAnalytics();
  const inDesktopApp = useInDesktopApp();

  const redirectTo = sanitizeInternalRedirectPath(searchParams.get("redirect"));
  const sessionExpired = searchParams.get(SESSION_EXPIRED_PARAM) === SESSION_EXPIRED_VALUE;
  // Preview closes sign-ups in Supabase Auth (MIN-766).
  const signupOpen = !isPreviewEnv();

  // Back from "Forgot your password?": the password step of the same address.
  const resumeEmail = searchParams.get("email") ?? "";
  const resume = searchParams.get("step") === "password" && isValidEmail(resumeEmail);
  const [step, setStep] = useState<Step>(resume ? "password" : "email");
  const [email, setEmail] = useState(resume ? resumeEmail : invite?.invitedEmail ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);
  const busy = loading || oauthPending !== null;
  /** The screen's work is done and the app is taking over (MIN-548). */
  const [redirecting, setRedirecting] = useState(false);
  const callbackErrors: Record<string, string> = {
    auth_callback_failed: t("callbackFailed"),
    confirmation_failed: t("confirmationFailed"),
    oauth_denied: t("oauthDenied"),
    oauth_failed: t("oauthFailed"),
  };
  const [error, setError] = useState<string | null>(callbackErrors[searchParams.get("error") ?? ""] ?? null);
  /**
   * The mobile app opens on what minddy does before asking anything (MIN-907),
   * unless the person came here for a reason of their own: an invitation, a
   * provider's error, an ended session.
   */
  const nativeMobile = useNativeMobile();
  const [welcomed, setWelcomed] = useState(() => !!invite || !!error || sessionExpired || resume || welcomeSeen());

  /**
   * Second factor (MIN-132). `unknown`: not checked yet, so neither the form
   * nor the challenge flashes on every return from a provider. `required`:
   * the session exists but is still `aal1`, and this screen is what follows.
   */
  const [mfaStep, setMfaStep] = useState<"unknown" | "none" | "required">("unknown");
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

  const goTo = (next: Step) => {
    setError(null);
    setPassword("");
    setStep(next);
  };

  const submitEmail = async () => {
    if (!email.trim()) return setError(t("emailRequired"));
    if (!isValidEmail(email)) return setError(t("emailInvalid"));
    setError(null);
    setLoading(true);
    try {
      const result = await lookupAccount(email);
      if ("failure" in result) {
        setError(t(result.failure));
        return;
      }
      if (result.status === "new") goTo(signupOpen ? "create" : "closed");
      else goTo(result.status);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    setError(null);
    setLoading(true);
    track("login_submitted", { method: "password" });
    try {
      await signInWithPassword(email, password);
      track("login_succeeded", { method: "password" });
      // Password accepted but the session is `aal1`: the challenge takes the
      // form's place (MIN-132) before any navigation the proxy would bounce.
      if (await needsMfaChallenge()) {
        setMfaStep("required");
        return;
      }
      setRedirecting(true);
      router.push(redirectTo);
    } catch (err) {
      // The raw refusal stays in the console for diagnosis; analytics get a
      // category, never the message, which can carry the address.
      console.error("[auth] sign-in refused:", err);
      track("login_failed", { method: "password", reason: errorReason(err) });
      setError(authErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  const createAccount = async () => {
    if (!passwordMeetsPolicy(password)) return setError(t("passwordPolicy"));
    setError(null);
    setLoading(true);
    track("signup_submitted", {});
    try {
      const { requiresEmailConfirmation } = await signUpWithPassword(email, password);
      track("signup_succeeded", { requires_email_confirmation: requiresEmailConfirmation });
      if (requiresEmailConfirmation) {
        goTo("confirm");
        return;
      }
      setRedirecting(true);
      router.push(redirectTo);
    } catch (err) {
      console.error("[auth] account creation failed:", err);
      track("signup_failed", { reason: errorReason(err) });
      setError(authErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setError(null);
    setOauthPending(provider);
    // One screen for both: whether the account exists is the provider's to know.
    track("oauth_initiated", { provider, context: "login" });
    try {
      await signInWithOAuth(provider, redirectTo);
      // The round goes on elsewhere (desktop), or the sign-in sheet was
      // closed (mobile): the buttons are free again.
      if (inDesktopApp || isNativeMobile()) setOauthPending(null);
    } catch (err) {
      track("login_failed", { method: provider, reason: errorReason(err) });
      setError(authErrorMessage(err, t));
      setOauthPending(null);
    }
  };

  const backToEmail = () => goTo("email");

  if (mfaStep === "required") {
    return (
      <AuthColumn inDesktopApp={inDesktopApp} footer={null}>
        <MfaChallenge
          onVerified={() => {
            setRedirecting(true);
            router.replace(redirectTo);
          }}
          onRecovered={async () => {
            // 2FA was just turned off: refresh the token first, or the proxy
            // still reads the old flag and sends the person back here.
            await refreshUser();
            toast.success(t("mfaDisabledNotice"));
            setRedirecting(true);
            router.replace(redirectTo);
          }}
        />
      </AuthColumn>
    );
  }

  if (nativeMobile && !welcomed && !user && step === "email") {
    return (
      <MobileWelcome
        onStart={() => {
          // Coming back from the server screen, or from a reload, lands on
          // the sign-in screen rather than on the welcome again.
          rememberWelcomeSeen();
          setWelcomed(true);
        }}
      />
    );
  }

  if (redirecting || mfaStep === "unknown") {
    return (
      <AuthColumn inDesktopApp={inDesktopApp} footer={null}>
        <RedirectingScreen label={t("redirecting")} />
      </AuthColumn>
    );
  }

  const errorLine = error ? (
    <p id="auth-error" role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
  const fieldError = error ? { "aria-invalid": true, "aria-describedby": "auth-error" } : {};

  /** The address the later steps are about, with the way back to change it. */
  const addressLine = (
    <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <span className="min-w-0 truncate">{email.trim()}</span>
      <button
        type="button"
        onClick={backToEmail}
        disabled={busy}
        className="shrink-0 font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-60"
      >
        {t("changeEmail")}
      </button>
    </p>
  );

  if (step === "confirm") {
    return (
      <AuthColumn inDesktopApp={inDesktopApp} footer={null}>
        <div className="space-y-6 text-center">
          <MailGlyph />
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{t("signupConfirmTitle")}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("confirmationSent", { email: email.trim() })}
            </p>
          </div>
          <AuthBackButton onClick={backToEmail} />
        </div>
      </AuthColumn>
    );
  }

  if (step === "closed") {
    return (
      <AuthColumn inDesktopApp={inDesktopApp} footer={null}>
        <div className="space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{tPreview("signupClosedTitle")}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{tPreview("signupClosedBody")}</p>
          </div>
          <div className="space-y-3">
            <Button asChild className={AUTH_SUBMIT_CLASS}>
              <a href={signupHref()}>{tPreview("signupClosedCta")}</a>
            </Button>
            <AuthBackButton onClick={backToEmail} />
          </div>
        </div>
      </AuthColumn>
    );
  }

  if (step === "password" || step === "create") {
    const creating = step === "create";
    return (
      <AuthColumn inDesktopApp={inDesktopApp} footer={null}>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void (creating ? createAccount() : signIn());
          }}
        >
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {creating ? t("signupPasswordTitle") : t("passwordTitle")}
            </h1>
            {addressLine}
          </div>
          <div className="space-y-3">
            {/* The address, for password managers to file the password under. */}
            <input type="email" name="email" autoComplete="username" value={email.trim()} readOnly hidden />
            <PasswordInput
              id="password"
              aria-label={t("password")}
              {...fieldError}
              className="h-12 bg-control text-base"
              autoComplete={creating ? "new-password" : "current-password"}
              autoFocus
              required
              placeholder={creating ? t("passwordPlaceholderSignUp") : t("passwordPlaceholder")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {creating && <PasswordRules password={password} />}
            {!creating && (
              <div className="flex justify-end">
                <Link
                  href={`/forgot-password${preserveAuthParams(searchParams, { email: email.trim() })}`}
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {t("forgotPasswordLink")}
                </Link>
              </div>
            )}
            {errorLine}
          </div>
          <div className="space-y-3">
            <Button type="submit" disabled={busy || !password} className={AUTH_SUBMIT_CLASS}>
              {loading && <Spinner />}
              {creating ? t("createAccount") : t("signIn")}
              {!loading && <SubmitArrow />}
            </Button>
            <AuthBackButton onClick={backToEmail} disabled={busy} />
            {creating && <SignupLegalNotice external={inDesktopApp} />}
          </div>
        </form>
      </AuthColumn>
    );
  }

  if (step === "oauth") {
    return (
      <AuthColumn inDesktopApp={inDesktopApp} footer={null}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{t("oauthOnlyTitle")}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("oauthOnlyBody")}</p>
            {addressLine}
          </div>
          <OAuthButtons providers={oauthProviders} pending={oauthPending} disabled={busy} onSelect={(provider) => void handleOAuth(provider)} />
          {errorLine}
          <div className="space-y-3">
            <Button asChild variant="outline" className="h-12 w-full justify-center rounded-full">
              <Link href={`/forgot-password${preserveAuthParams(searchParams, { email: email.trim() })}`}>{t("setPassword")}</Link>
            </Button>
            <AuthBackButton onClick={backToEmail} disabled={busy} />
          </div>
        </div>
      </AuthColumn>
    );
  }

  return (
    // The self-hosting way in closes the list of ways in, under the services.
    <AuthColumn inDesktopApp={inDesktopApp} footer={null}>
      <div className="space-y-6">
        {/* The invitation banner (MIN-197) only announces: the verified
            address of the session attaches the person to the project, at
            /auth/callback. */}
        {invite && (
          <div className="flex gap-3 rounded-lg border border-border bg-card p-3.5">
            <HugeiconsIcon icon={UserAdd01Icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
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

        {sessionExpired && !invite && (
          <div className="flex gap-3 rounded-lg border border-border bg-card p-3.5" role="status">
            <HugeiconsIcon icon={Clock01Icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm leading-snug">{t("sessionExpired")}</p>
          </div>
        )}

        <h1 className="text-center font-display text-2xl font-semibold tracking-tight">{t("entryTitle")}</h1>

        <form
          className="space-y-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submitEmail();
          }}
        >
          <Input
            id="email"
            type="email"
            inputMode="email"
            aria-label={t("email")}
            {...fieldError}
            className="h-12 bg-control text-base"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {errorLine}
          <Button type="submit" disabled={busy || !isValidEmail(email)} className={AUTH_SUBMIT_CLASS}>
            {loading && <Spinner />}
            {tCommon("continue")}
          </Button>
        </form>

        {(!oauthProvidersResolved || oauthProviders.length > 0) && (
          <>
            <OrDivider />
            {oauthProvidersResolved ? (
              <OAuthButtons providers={oauthProviders} pending={oauthPending} disabled={busy} onSelect={(provider) => void handleOAuth(provider)} />
            ) : (
              <AuthMethodsSkeleton />
            )}
          </>
        )}

        <SelfHostButton />
      </div>
    </AuthColumn>
  );
}
