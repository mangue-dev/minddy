"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner, toast } from "mangue-ui";
import { MfaChallenge } from "@/components/auth/mfa-challenge";
import {
  AuthColumn,
  Field,
  PasswordRules,
  useInDesktopApp,
} from "@/components/auth/auth-chrome";
import { useAuth } from "@/lib/auth-context";
import { useAnalytics } from "@/lib/use-analytics";
import { errorReason } from "@/lib/analytics-sanitize";
import { authErrorMessage } from "@/lib/auth-errors";
import { MIN_PASSWORD_LENGTH, passwordMeetsPolicy } from "@/lib/password-policy";

/** Where we land once the password has been changed: the session is open. */
const AFTER_RESET = "/home";

/**
 * The end of the “forgotten password” route (MIN-297): we choose the new one.
 *
 * We only arrive here with a SESSION — the one opened by `/auth/confirm` in
 * consuming the received link token. Hence the shape of the screen: no field
 * “old password” (it is precisely what we lost), and no token
 * in the URL either. Without a session, there is nothing to do here, and the screen
 * said instead of displaying a form that would fail on submission.
 *
 * **The second factor remains required** (MIN-132). A reset link opens
 * a `aal1` session: without this step, a compromised mailbox would be enough to
 * take back an account protected by 2FA, and the postman would no longer be of any use
 * precisely the day he serves. The same component as the connection
 * charge, with the same net “I no longer have my phone”.
 */
export function ResetPasswordForm() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const { user, loading, updateUser, needsMfaChallenge, refreshUser } = useAuth();
  const { track } = useAnalytics();
  const inDesktopApp = useInDesktopApp();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * `unknown` = we have not yet looked, so we neither display the form nor
   * the challenge: showing one then the other would cause the screen to flash each time
   * arrival. Same bias as the login screen.
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
      if (!cancelled) setMfaStep(required ? "required" : "none");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, needsMfaChallenge]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    // The policy first: it is DISPLAYED, rule by rule, under the field.
    // Comparing the two entries before holding it would bring up “do not
    // do not match” on a password that the server would refuse.
    if (!passwordMeetsPolicy(password)) {
      setError(t("passwordPolicy"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await updateUser({ password });
      track("password_reset_completed", {});
      toast.success(t("resetDone"));
      router.replace(AFTER_RESET);
    } catch (err) {
      // Raw refusal in the console: the call goes from the browser to
      // Supabase, there is nothing to read on the Vercel side. The two expected refusals
      // here are `weak_password` (known leaked password — the check
      // HIBP is active on the server side) and `same_password`.
      console.error("[reset-password] refus de Supabase Auth:", err);
      track("password_reset_failed", { reason: errorReason(err) });
      setError(authErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (loading || mfaStep === "unknown") {
    return (
      <AuthColumn inDesktopApp={inDesktopApp}>
        <div className="flex justify-center">
          <Spinner className="size-6" />
        </div>
      </AuthColumn>
    );
  }

  // No session: the link has already been used, or too much time has passed. The exit
  // is a NEW link, not the login page — that's what we came for
  // chercher.
  if (!user) {
    return (
      <AuthColumn inDesktopApp={inDesktopApp}>
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {t("resetExpiredTitle")}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("resetExpiredBody")}
            </p>
          </div>
          <Button asChild className="h-10 w-full justify-center">
            <Link href="/forgot-password">{t("resetExpiredCta")}</Link>
          </Button>
        </div>
      </AuthColumn>
    );
  }

  if (mfaStep === "required") {
    return (
      <AuthColumn inDesktopApp={inDesktopApp}>
        <MfaChallenge
          onVerified={() => setMfaStep("none")}
          onRecovered={async () => {
            // 2FA has just been cut: refresh the token before
            // continue, otherwise the rest of the screen still reads the old flag.
            await refreshUser();
            toast.success(t("mfaDisabledNotice"));
            setMfaStep("none");
          }}
        />
      </AuthColumn>
    );
  }

  return (
    <AuthColumn inDesktopApp={inDesktopApp}>
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("resetTitle")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t("resetSubtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field id="password" label={t("newPassword")}>
            <Input
              id="password"
              type="password"
              className="h-10 bg-card"
              autoComplete="new-password"
              autoFocus
              required
              minLength={MIN_PASSWORD_LENGTH}
              placeholder={t("passwordPlaceholderSignUp")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <PasswordRules password={password} />

          <Field id="confirmPassword" label={t("confirmPassword")}>
            <Input
              id="confirmPassword"
              type="password"
              className="h-10 bg-card"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              placeholder={t("confirmPasswordPlaceholder")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            disabled={busy || !passwordMeetsPolicy(password)}
            className="h-10 w-full justify-center gap-2"
          >
            {busy && <Spinner />}
            {t("resetSubmit")}
          </Button>
        </form>
      </div>
    </AuthColumn>
  );
}
