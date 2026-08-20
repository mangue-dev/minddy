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
 * The connection, and nothing else (MIN-300).
 *
 * The screen carried both intentions — connect, register — in the same
 * flip form, on a two-column page of which the left half was
 * a WebGL shader. All that remains is what we come to do there: a centered column,
 * two providers, an address, a password. Registration has its own route
 * ([signup-wizard.tsx](signup-wizard.tsx)), and the bottom link leads there keeping
 * the destination and the current invitation.
 *
 * The animated background left with it, and nothing replaced it: see the header of
 * `app/(auth)/auth-shell.tsx` for what was tried and why.
 */
export function LoginForm({ invite }: { invite: InvitationPreview | null }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    user,
    oauthProviders,
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
  // The address being entered travels to the request screen — this is a
  // URL parameter, therefore calculated when rendered from the state of the field.
  const forgotPasswordHref = `/forgot-password${preserveAuthParams(
    searchParams,
    email.trim() ? { email: email.trim() } : undefined
  )}`;
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Provider being redirected — the page is going to Google/GitHub, so this
  // state is never reset to null on success (only on error).
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
   * **In the desktop app, the entry is REGISTRATION** (MIN-292, MIN-300).
   *
   * Someone who just downloaded 120MB and dragged an icon into
   * Most applications do not yet have an account. Gold the window
   * opens on `/home`, and the proxy returns here for lack of session: without this
   * detour, the first screen of the product would be a login form, and it
   * You'll have to find the bottom link before you can begin.
   *
   * `?mode=signin` deactivates it, and that's what the "I already have a
   * account” of the wizard: an explicit choice does not have to be undone by a default.
   * A `?error=` deactivates it too — the screen then has something to SAY
   * (“connection canceled”, “this link has expired”), and go elsewhere
   * would win without anyone reading it.
   *
   * The test is done in an effect — `window.minddy` does not exist on the server side,
   * and assuming this would cause the hydration to diverge.
   */
  const modeParam = searchParams.get("mode");
  const errorParam = searchParams.get("error");
  const [redirectingToSignup, setRedirectingToSignup] = useState(false);
  useEffect(() => {
    if (modeParam === "signin" || errorParam || !isDesktop()) return;
    setRedirectingToSignup(true);
    router.replace(signUpHref);
  }, [modeParam, errorParam, router, signUpHref]);

  // Only one connection attempt at a time (email OR provider).
  const busy = loading || oauthPending !== null;

  /**
   * Second factor (MIN-132). `unknown` = we haven't watched yet — so we
   * displays neither the form nor the challenge, otherwise one of the two flashes
   * every return from Google. `required` = the session exists but remains active
   * `aal1`: This is the proxy that sent us here, and this screen IS what happens next.
   */
  const [mfaStep, setMfaStep] = useState<"unknown" | "none" | "required">("unknown");

  // Already authenticated (e.g. session restored) → leave the auth screen,
  // unless there is still one factor to present.
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
      // Password accepted, but the session is in `aal1`: the challenge
      // takes the place of the form (MIN-132). Navigating first would make a
      // round trip visible to the proxy, which would send us back here.
      if (await needsMfaChallenge()) {
        setMfaStep("required");
        return;
      }
      router.push(redirectTo);
    } catch (err) {
      // The raw refusal in the console: we only display one sentence, but it is
      // the `code` and HTTP status which allow diagnosis. Without that,
      // a refusal that we do not yet know how to translate leaves no trace —
      // the call goes from the browser to Supabase, there is nothing on the Vercel side.
      console.error("[login] refus de Supabase Auth:", err);
      // We send a CATEGORY, never the message: it can carry the email.
      track("login_failed", { method: "password", reason: errorReason(err) });
      // Translated when you know how to do it: “Invalid login credentials” is the
      // the most frequent refusal of the product, and it arrived in English.
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
      // Success = the page navigates to the provider; we never come back here.
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
            // 2FA has just been cut: refresh the token before leaving,
            // otherwise the proxy still reads the old flag and returns here — a
            // loop, just after burning some code.
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
          {/* The invitation banner (MIN-197). He only ANNOUNCES: nothing
 here attaches the person to the project — it is the verified email of
 his session which takes care of it, at /auth/callback. */}
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
            providers={oauthProviders}
            pending={oauthPending}
            disabled={busy}
            onSelect={(provider) => void handleOAuth(provider)}
          />

          {oauthProviders.length > 0 && <AuthSeparator label={t("orContinueWithEmail")} />}

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

            {/* The only way back for an account without Google or GitHub
 (MIN-297). Under the field, aligned to the right: this is where we look for it, and this is the moment when we discover that we forgot.
 The address already typed follows it, so as not to retype it. */}
            <div className="flex justify-end">
              <Link
                href={forgotPasswordHref}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("forgotPasswordLink")}
              </Link>
            </div>

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
