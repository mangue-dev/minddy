"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Input, Spinner } from "mangue-ui";
import { ArrowLeft, Shuffle, UserPlus } from "lucide-react";
import { WizardStepper } from "@/components/wizard/wizard-stepper";
import { UserAvatar } from "@/components/user-avatar";
import {
  AuthColumn,
  AuthSeparator,
  Field,
  MailGlyph,
  OAuthButtons,
  PasswordRules,
  SignupLegalNotice,
  useInDesktopApp,
  type OAuthProvider,
} from "@/components/auth/auth-chrome";
import { useAuth } from "@/lib/auth-context";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import { useAnalytics } from "@/lib/use-analytics";
import { errorReason } from "@/lib/analytics-sanitize";
import { authErrorMessage } from "@/lib/auth-errors";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import {
  SIGNUP_STEPS,
  nextSignupStep,
  preserveAuthParams,
  previousSignupStep,
  validateSignupStep,
  type SignupStep,
} from "@/lib/signup-wizard";
import type { InvitationPreview } from "@/lib/types";

/**
 * Registration, in three steps (MIN-300): the account (a provider, or a
 * address), the name you will use, the password.
 *
 * **Why a course and not a form.** The registration lived in
 * the login screen, like a tab: five fields at once, including three which
 * only appeared in “registration” mode. In the browser it was
 * only dense; in the desktop app, which OPENS on this screen (MIN-292),
 * this was the first screen of the product. An installed window that has just been
 * dragging in Applications is entitled to a welcome, not a form
 * shared with another intention.
 *
 * This file does not decide anything: the order of the steps, their validation and the
 * Parameters passing through them live in [signup-wizard.ts](../../lib/signup-wizard.ts),
 * which is tested. Here, we draw and call Supabase.
 *
 * **Nothing is written before the last step.** The account is born from a single call,
 * to the final submission: giving up on the way leaves no account half-hearted
 * created, which would then block its own address.
 */

/** The invalidity code for a step is a key in the `Auth` namespace. */
const ISSUE_KEYS = {
  emailRequired: "emailRequired",
  emailInvalid: "emailInvalid",
  nameRequired: "nameRequired",
  passwordPolicy: "passwordPolicy",
  passwordMismatch: "passwordMismatch",
} as const;

export function SignupWizard({ invite }: { invite: InvitationPreview | null }) {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, signUpWithPassword, signInWithOAuth } = useAuth();
  const { track } = useAnalytics();
  const inDesktopApp = useInDesktopApp();

  const redirectTo = sanitizeInternalRedirectPath(searchParams.get("redirect"));
  // “I already have an account” keeps the destination and the invitation. He does not pose
  // `mode=signin` only IN THE DESKTOP APP, where it is really used: it opens
  // registration by default, and without this flag it would immediately return here
  // the person who has just come out. On the web this defect does not exist, so
  // the parameter would only dirty up a URL that we share and put up
  // favori — `/login` y suffit.
  const signInHref = `/login${preserveAuthParams(
    searchParams,
    inDesktopApp ? { mode: "signin" } : undefined
  )}`;

  const [step, setStep] = useState<SignupStep>("account");
  // The sense of animation: +1 we move forward, -1 we return.
  const [direction, setDirection] = useState(1);

  const [fullName, setFullName] = useState("");
  // The guest address is the one to which the email arrived: it is SHE who
  // links the person to the project, not the link token. Pre-filling it avoids
  // the most expensive mistake here — registering with another address and
  // ne rien voir venir (MIN-197).
  const [email, setEmail] = useState(invite?.invitedEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  /**
   * The account mark, taken HERE, before the account existed (MIN-300).
   *
   * Elsewhere in the product, an avatar does not choose itself: it withdraws
   * spell (`public.user_avatars`, settings → “New avatar”). The name stage
   * follows the same rule — you see your brand, you can relaunch it, you don’t
   * not choose. As there is no account yet to write it to, the draw
   * travels in `user_metadata.avatar_seed` and arises at the first session.
   *
   * Drawn in an effect and not at the initial rendering: `crypto.randomUUID()` gives
   * a different value on the server and in the browser, which would make
   * diverger l'hydratation.
   */
  const [avatarSeed, setAvatarSeed] = useState<string | null>(null);
  useEffect(() => setAvatarSeed(crypto.randomUUID()), []);

  const [loading, setLoading] = useState(false);
  // Provider being redirected — the page is going to Google/GitHub, so this
  // state is never reset to null on success (only on error).
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The address to which a confirmation link has just left. */
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<string | null>(null);

  const busy = loading || oauthPending !== null;

  // Already authenticated (session restored, return from a provider): there is no more
  // account to create. No MFA challenge here — a newly created account
  // does not have a second factor, and a restored session that expects one will
  // is returned to /login by the proxy.
  useEffect(() => {
    if (user) router.replace(redirectTo);
  }, [user, router, redirectTo]);

  const values = { email, fullName, password, confirmPassword };
  const issue = validateSignupStep(step, values);

  const goTo = (target: SignupStep, way: number) => {
    setDirection(way);
    setError(null);
    setStep(target);
  };

  const handleBack = () => {
    const previous = previousSignupStep(step);
    if (previous) goTo(previous, -1);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (issue) {
      // The button is grayed out as long as the step is invalid; this path
      // is that of the Enter key, which does not concern him.
      setError(t(ISSUE_KEYS[issue], { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    setError(null);

    const following = nextSignupStep(step);
    if (following) {
      goTo(following, 1);
      return;
    }

    setLoading(true);
    track("signup_submitted", {});
    try {
      const { requiresEmailConfirmation } = await signUpWithPassword(email, password, {
        fullName: fullName.trim() || undefined,
        avatarSeed: avatarSeed ?? undefined,
      });
      track("signup_succeeded", {
        requires_email_confirmation: requiresEmailConfirmation,
      });
      if (requiresEmailConfirmation) {
        setAwaitingConfirmation(email);
        setPassword("");
        setConfirmPassword("");
        return;
      }
      // Immediate session (confirmation disabled): this account will not pass
      // by `/auth/callback`, so this is where we place the chosen mark.
      // Best-effort — a failed avatar is not worth keeping someone on
      // the registration screen, and the account will draw one on first display.
      if (avatarSeed) {
        await fetch("/api/me/avatar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ seed: avatarSeed }),
        }).catch(() => {});
      }
      router.push(redirectTo);
    } catch (err) {
      // The raw refusal in the console: we only display one sentence, but it is
      // the `code` and HTTP status which allow diagnosis. Without that,
      // a refusal that we do not yet know how to translate leaves no trace —
      // the call goes from the browser to Supabase, there is nothing on the Vercel side.
      console.error("[signup] refus de Supabase Auth:", err);
      // We send a CATEGORY, never the message: it can carry the email.
      track("signup_failed", { reason: errorReason(err) });
      setError(authErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setError(null);
    setOauthPending(provider);
    track("oauth_initiated", { provider, context: "signup" });
    try {
      // Success = the page navigates to the provider; we never come back here.
      await signInWithOAuth(provider, redirectTo);
    } catch (err) {
      track("signup_failed", { reason: errorReason(err) });
      setError(authErrorMessage(err, t));
      setOauthPending(null);
    }
  };

  const stepIndex = SIGNUP_STEPS.indexOf(step);
  const stepNames: Record<SignupStep, string> = {
    account: t("signupStepAccountName"),
    identity: t("signupStepIdentityName"),
    password: t("signupStepPasswordName"),
  };
  const headings: Record<SignupStep, { title: string; subtitle: string }> = {
    account: { title: t("signupAccountTitle"), subtitle: t("signupAccountSubtitle") },
    identity: { title: t("signupIdentityTitle"), subtitle: t("signupIdentitySubtitle") },
    password: { title: t("signupPasswordTitle"), subtitle: t("signupPasswordSubtitle") },
  };

  // The confirmation link is gone: the screen no longer has any fields to fill in,
  // just one sentence and the exit. The account already exists — hence
  // the absence of going back.
  if (awaitingConfirmation) {
    return (
      <AuthColumn inDesktopApp={inDesktopApp}>
        <div className="space-y-6 text-center">
          <MailGlyph />
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {t("signupConfirmTitle")}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("confirmationSent", { email: awaitingConfirmation })}
            </p>
          </div>
          <Button asChild variant="outline" className="h-10 w-full justify-center">
            <Link href={signInHref}>{t("signIn")}</Link>
          </Button>
        </div>
      </AuthColumn>
    );
  }

  return (
    <AuthColumn inDesktopApp={inDesktopApp}>
      <div className="space-y-8">
        <WizardStepper
          currentStep={stepIndex + 1}
          totalSteps={SIGNUP_STEPS.length}
          getStepLabel={(n) => stepNames[SIGNUP_STEPS[n - 1] as SignupStep]}
          onStepClick={(n) => goTo(SIGNUP_STEPS[n - 1] as SignupStep, -1)}
        />

        {/* The invitation banner (MIN-197). It just ANNOUNCES: nothing here
 attaches the person to the project — it is the verified email of their
 session which takes care of it, at /auth/callback. */}
        {invite && step === "account" && (
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
            {headings[step].title}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {headings[step].subtitle}
          </p>
        </div>

        {/* The body slides from one stage to another; the rest does not move —
 this is minddy's wizard grammar (wizard-dialog.tsx). */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* `overflow-hidden` hides the step that exits from the side — and cuts
 also the focus ring of the fields (3 px), on the three edges.
 The inner padding moves the content away from the cutting edge.
 Horizontally it is taken up by a negative margin, otherwise the
 fields would be narrower than the button below ;
 vertically, NO: the negative margin ate up the space between the
 last field and "Continue", and six more pixels here are not visible. */}
          <div className="relative -mx-1.5 overflow-hidden px-1.5 py-1.5">
            <AnimatePresence initial={false} mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                initial={{ opacity: 0, x: direction * 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -16 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="space-y-4"
              >
                {step === "account" && (
                  <>
                    <OAuthButtons
                      pending={oauthPending}
                      disabled={busy}
                      onSelect={(provider) => void handleOAuth(provider)}
                    />
                    <AuthSeparator label={t("orContinueWithEmail")} />
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
                  </>
                )}

                {step === "identity" && (
                  <>
                    {/* The brand, and the only gesture we have on it: the
 restart. Same grammar as account settings
 (account-profile-section.tsx). */}
                    <div className="flex items-center gap-3">
                      <UserAvatar seed={avatarSeed} className="size-11" />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setAvatarSeed(crypto.randomUUID())}
                      >
                        <Shuffle className="size-3.5" />
                        {t("newAvatar")}
                      </Button>
                    </div>

                    <Field id="full-name" label={t("fullName")}>
                      <Input
                        id="full-name"
                        type="text"
                        className="h-10 bg-card"
                        autoComplete="name"
                        autoFocus
                        required
                        placeholder={t("fullNamePlaceholder")}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </Field>
                  </>
                )}

                {step === "password" && (
                  <>
                    {/* The address, in a hidden field: without it, a password manager saves the new password without knowing which account it belongs to. */}
                    <input
                      type="email"
                      name="email"
                      autoComplete="username"
                      value={email}
                      readOnly
                      hidden
                    />
                    <Field id="password" label={t("password")}>
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

                    <Input
                      id="confirm-password"
                      type="password"
                      className="h-10 bg-card"
                      autoComplete="new-password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      aria-label={t("confirmPassword")}
                      placeholder={t("confirmPasswordPlaceholder")}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-3">
            <Button
              type="submit"
              disabled={busy || issue !== null}
              className="h-10 w-full justify-center gap-2"
            >
              {loading && <Spinner />}
              {step === "password" ? t("createAccount") : tCommon("continue")}
            </Button>

            {step === "password" && <SignupLegalNotice external={inDesktopApp} />}

            {stepIndex > 0 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={busy}
                className="mx-auto flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
              >
                <ArrowLeft className="size-3.5" />
                {tCommon("back")}
              </button>
            )}
          </div>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {t("alreadyHaveAccount")}{" "}
          <Link
            href={signInHref}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("signIn")}
          </Link>
        </p>
      </div>
    </AuthColumn>
  );
}

