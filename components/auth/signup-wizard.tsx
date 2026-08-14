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
 * L'inscription, en trois étapes (MIN-300) : le compte (un provider, ou une
 * adresse), le nom qu'on portera, le mot de passe.
 *
 * **Pourquoi un parcours et non un formulaire.** L'inscription vivait dans
 * l'écran de connexion, comme un onglet : cinq champs d'un coup, dont trois qui
 * n'apparaissaient qu'en mode « inscription ». Dans le navigateur c'était
 * seulement dense ; dans l'app de bureau, qui s'OUVRE sur cet écran (MIN-292),
 * c'était le premier écran du produit. Une fenêtre installée qu'on vient de
 * faire glisser dans Applications a droit à un accueil, pas à un formulaire
 * partagé avec une autre intention.
 *
 * Ce fichier ne décide de rien : l'ordre des étapes, leur validation et les
 * paramètres qui les traversent vivent dans [signup-wizard.ts](../../lib/signup-wizard.ts),
 * qui est testé. Ici, on dessine et on appelle Supabase.
 *
 * **Rien n'est écrit avant la dernière étape.** Le compte naît d'un seul appel,
 * à la soumission finale : abandonner en route ne laisse aucun compte à demi
 * créé, qui bloquerait ensuite sa propre adresse.
 */

/** Le code d'invalidité d'une étape est une clé du namespace `Auth`. */
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
  // « J'ai déjà un compte » garde la destination et l'invitation. Il ne pose
  // `mode=signin` que DANS L'APP DE BUREAU, où il sert vraiment : elle ouvre
  // l'inscription par défaut, et sans ce drapeau elle renverrait aussitôt ici
  // la personne qui vient d'en sortir. Sur le web ce défaut n'existe pas, donc
  // le paramètre ne ferait que salir une URL qu'on partage et qu'on met en
  // favori — `/login` y suffit.
  const signInHref = `/login${preserveAuthParams(
    searchParams,
    inDesktopApp ? { mode: "signin" } : undefined
  )}`;

  const [step, setStep] = useState<SignupStep>("account");
  // Le sens de l'animation : +1 on avance, -1 on revient.
  const [direction, setDirection] = useState(1);

  const [fullName, setFullName] = useState("");
  // L'adresse invitée est celle à laquelle le mail est arrivé : c'est ELLE qui
  // rattache la personne au projet, pas le token du lien. La pré-remplir évite
  // la faute qui coûte le plus cher ici — s'inscrire avec une autre adresse et
  // ne rien voir venir (MIN-197).
  const [email, setEmail] = useState(invite?.invitedEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  /**
   * La marque du compte, tirée ICI, avant que le compte existe (MIN-300).
   *
   * Ailleurs dans le produit, un avatar ne se choisit pas : il se retire au
   * sort (`public.user_avatars`, réglages → « Nouvel avatar »). L'étape du nom
   * suit la même règle — on voit sa marque, on peut la relancer, on ne la
   * choisit pas. Comme il n'y a pas encore de compte à qui l'écrire, le tirage
   * voyage dans `user_metadata.avatar_seed` et se pose à la première session.
   *
   * Tirée dans un effet et non au rendu initial : `crypto.randomUUID()` donne
   * une valeur différente sur le serveur et dans le navigateur, ce qui ferait
   * diverger l'hydratation.
   */
  const [avatarSeed, setAvatarSeed] = useState<string | null>(null);
  useEffect(() => setAvatarSeed(crypto.randomUUID()), []);

  const [loading, setLoading] = useState(false);
  // Provider en cours de redirection — la page part vers Google/GitHub, donc cet
  // état n'est jamais remis à null en cas de succès (seulement sur erreur).
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** L'adresse à laquelle un lien de confirmation vient de partir. */
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<string | null>(null);

  const busy = loading || oauthPending !== null;

  // Déjà authentifié (session restaurée, retour d'un provider) : il n'y a plus
  // de compte à créer. Pas de challenge MFA ici — un compte qui vient de naître
  // n'a pas de second facteur, et une session restaurée qui en attend un se
  // fait renvoyer sur /login par le proxy.
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
      // Le bouton est grisé tant que l'étape n'est pas valide ; ce chemin-ci
      // est celui de la touche Entrée, qui ne le regarde pas.
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
      // Session immédiate (confirmation désactivée) : ce compte ne passera pas
      // par `/auth/callback`, donc c'est ici qu'on pose la marque choisie.
      // Best-effort — un avatar manqué ne vaut pas de retenir quelqu'un sur
      // l'écran d'inscription, et le compte en tirera un au premier affichage.
      if (avatarSeed) {
        await fetch("/api/me/avatar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ seed: avatarSeed }),
        }).catch(() => {});
      }
      router.push(redirectTo);
    } catch (err) {
      // Le refus brut dans la console : on n'affiche qu'une phrase, or c'est
      // le `code` et le statut HTTP qui permettent de diagnostiquer. Sans ça,
      // un refus qu'on ne sait pas encore traduire ne laisse aucune trace —
      // l'appel part du navigateur vers Supabase, il n'y a rien côté Vercel.
      console.error("[signup] refus de Supabase Auth:", err);
      // On envoie une CATÉGORIE, jamais le message : il peut porter l'email.
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
      // Succès = la page navigue vers le provider ; on ne repasse jamais ici.
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

  // Le lien de confirmation est parti : l'écran n'a plus de champ à remplir,
  // seulement une phrase et la sortie. Le compte, lui, existe déjà — d'où
  // l'absence de retour en arrière.
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

        {/* Le bandeau d'invitation (MIN-197). Il ne fait qu'ANNONCER : rien ici
            ne rattache la personne au projet — c'est l'email vérifié de sa
            session qui s'en charge, à /auth/callback. */}
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

        {/* Le corps glisse d'une étape à l'autre ; le reste ne bouge pas —
            c'est la grammaire des wizards de minddy (wizard-dialog.tsx). */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* `overflow-hidden` cache l'étape qui sort par le côté — et coupait
              aussi l'anneau de focus des champs (3 px), sur les trois bords.
              Le padding intérieur éloigne le contenu du bord de découpe.
              Horizontalement il est repris par une marge négative, sinon les
              champs seraient plus étroits que le bouton d'en dessous ;
              verticalement, NON : la marge négative mangeait l'espace entre le
              dernier champ et « Continuer », et six pixels de plus ici ne se
              voient pas. */}
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
                    {/* La marque, et le seul geste qu'on a sur elle : la
                        relancer. Même grammaire qu'aux réglages du compte
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
                    {/* L'adresse, en champ caché : sans elle, un gestionnaire de
                        mots de passe enregistre le nouveau mot de passe sans
                        savoir à quel compte il appartient. */}
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

