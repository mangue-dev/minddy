"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner } from "mangue-ui";
import {
  AuthColumn,
  Field,
  MailGlyph,
  useInDesktopApp,
} from "@/components/auth/auth-chrome";
import { useAuth } from "@/lib/auth-context";
import { isValidEmail, preserveAuthParams } from "@/lib/signup-wizard";
import { useAnalytics } from "@/lib/use-analytics";
import { errorReason } from "@/lib/analytics-sanitize";
import { authErrorMessage } from "@/lib/auth-errors";

/**
 * “Forgotten password” (MIN-297).
 *
 * The product had none: without a Google or GitHub account, a password
 * lost locked out, permanently. It was the screen that was missing, and it
 * does just one thing — ask for an address and send a link.
 *
 * **It never says if the account exists.** GoTrue responds the same in both
 * case, and the confirmation screen is worded so that it is true at
 * the display too (“if an account exists for this address”): a screen which
 * would distinguish the two would be a revealer of accounts, that is to say the
 * half the work of an attacker, free.
 *
 * The rest of the journey is elsewhere: the link received goes through `/auth/confirm`
 * (the gesture that opens the session, MIN-345) then by `/reset-password`, where the
 * nouveau mot de passe se choisit.
 */
export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const searchParams = useSearchParams();
  const { sendPasswordReset } = useAuth();
  const { track } = useAnalytics();
  const inDesktopApp = useInDesktopApp();

  // The address already typed on the connection screen, if there was one: the
  // retyping here is the kind of friction that makes you abandon a course
  // from which we only exit, by definition, through the mailbox.
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The address to which a link just left — the screen then changes. */
  const [sentTo, setSentTo] = useState<string | null>(null);

  const backHref = `/login${preserveAuthParams(searchParams)}`;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidEmail(email)) {
      setError(t("emailInvalid"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      // No prop: the address is personal data, and the only fact
      // interesting here is that a reset process has started.
      track("password_reset_requested", {});
      setSentTo(email.trim());
    } catch (err) {
      // Raw refusal in the console: the call goes from the browser to
      // Supabase, there is nothing to read on the Vercel side. Which really goes back,
      // this is the rate limit (`over_email_send_rate_limit`) — translated.
      console.error("[forgot-password] refus de Supabase Auth:", err);
      track("password_reset_failed", { reason: errorReason(err) });
      setError(authErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <AuthColumn inDesktopApp={inDesktopApp}>
        <div className="space-y-6 text-center">
          <MailGlyph />
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {t("forgotSentTitle")}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("forgotSentBody", { email: sentTo })}
            </p>
          </div>
          <Button asChild variant="outline" className="h-10 w-full justify-center">
            <Link href={backHref}>{t("forgotBackToLogin")}</Link>
          </Button>
        </div>
      </AuthColumn>
    );
  }

  return (
    <AuthColumn inDesktopApp={inDesktopApp}>
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("forgotTitle")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t("forgotSubtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field id="email" label={t("email")}>
            <Input
              id="email"
              type="email"
              className="h-10 bg-card"
              autoComplete="email"
              autoFocus
              required
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            disabled={loading}
            className="h-10 w-full justify-center gap-2"
          >
            {loading && <Spinner />}
            {t("forgotSubmit")}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link
            href={backHref}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("forgotBackToLogin")}
          </Link>
        </p>
      </div>
    </AuthColumn>
  );
}
