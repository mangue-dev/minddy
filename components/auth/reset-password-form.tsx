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

/** Où l'on atterrit une fois le mot de passe changé : la session est ouverte. */
const AFTER_RESET = "/home";

/**
 * Le bout du parcours « mot de passe oublié » (MIN-297) : on choisit le nouveau.
 *
 * On n'arrive ici qu'avec une SESSION — celle qu'a ouverte `/auth/confirm` en
 * consommant le jeton du lien reçu. D'où la forme de l'écran : pas de champ
 * « ancien mot de passe » (il est précisément ce qu'on a perdu), et pas de jeton
 * dans l'URL non plus. Sans session, il n'y a rien à faire ici, et l'écran le
 * dit au lieu d'afficher un formulaire qui échouerait à la soumission.
 *
 * **Le second facteur reste exigé** (MIN-132). Un lien de réinitialisation ouvre
 * une session `aal1` : sans ce pas, une boîte mail compromise suffirait à
 * reprendre un compte protégé par 2FA, et le facteur ne servirait plus à rien
 * précisément le jour où il sert. Le même composant que la connexion s'en
 * charge, avec le même filet « je n'ai plus mon téléphone ».
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
   * `unknown` = on n'a pas encore regardé, donc on n'affiche NI le formulaire NI
   * le challenge : montrer l'un puis l'autre ferait clignoter l'écran à chaque
   * arrivée. Même parti pris que l'écran de connexion.
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
    // La politique d'abord : elle est AFFICHÉE, règle par règle, sous le champ.
    // Comparer les deux saisies avant de la tenir ferait apparaître « ne
    // correspondent pas » sur un mot de passe que le serveur allait refuser.
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
      // Le refus brut dans la console : l'appel part du navigateur vers
      // Supabase, il n'y a rien à lire côté Vercel. Les deux refus attendus
      // ici sont `weak_password` (mot de passe connu d'une fuite — le contrôle
      // HIBP est actif côté serveur) et `same_password`.
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

  // Pas de session : le lien a déjà servi, ou trop de temps a passé. La sortie
  // est un NOUVEAU lien, pas la page de connexion — c'est ce qu'on est venu
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
            // La 2FA vient d'être coupée : rafraîchir le jeton avant de
            // continuer, sinon la suite de l'écran lit encore l'ancien drapeau.
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
