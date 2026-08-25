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
 * We only arrive here with a session — the one opened by `/auth/confirm` after
 * consuming the received link token. Hence the shape of the screen: no old
 * password field (it is precisely what was lost), and no token in the URL.
 * Without a session, the screen explains the expiry instead of displaying a
 * form that would fail on submission.
 *
 * **The second factor remains required** (MIN-132). A reset link opens an
 * `aal1` session: without this step, a compromised mailbox would be enough to
 * take over an account protected by MFA. This uses the same challenge and
 * recovery-code escape hatch as sign-in.
 */
export function ResetPasswordForm() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const { user, loading, needsMfaChallenge, refreshUser } = useAuth();
  const { track } = useAnalytics();
  const inDesktopApp = useInDesktopApp();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * `unknown` means the MFA state has not been resolved yet, so neither the
   * form nor the challenge is displayed. This avoids flashing one before the
   * other, matching the login screen.
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
    // Check the displayed policy first. Comparing entries before this would
    // report a mismatch for a password the server would reject anyway.
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
      const response = await fetch("/api/account/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const payload =
          result && typeof result === "object"
            ? (result as { error?: unknown; code?: unknown })
            : {};
        const resetError = new Error(
          typeof payload.error === "string" ? payload.error : "Password reset failed"
        ) as Error & { code?: string; status?: number };
        if (typeof payload.code === "string") resetError.code = payload.code;
        resetError.status = response.status;
        throw resetError;
      }
      track("password_reset_completed", {});
      toast.success(t("resetDone"));
      router.replace(AFTER_RESET);
    } catch (err) {
      // Keep the raw refusal in the console. Expected cases include
      // `weak_password` (the server-side HIBP check) and `same_password`.
      console.error("[reset-password] Supabase Auth rejected the reset:", err);
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

  // No session means the link was already used or expired. Offer a new link,
  // not the login page, because password recovery is still the user's goal.
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
            // MFA was just disabled: refresh the token before continuing so
            // the rest of the screen no longer reads the old flag.
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
