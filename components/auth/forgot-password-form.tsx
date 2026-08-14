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
 * « Mot de passe oublié » (MIN-297).
 *
 * Le produit n'en avait aucun : sans compte Google ni GitHub, un mot de passe
 * perdu enfermait dehors, définitivement. C'est l'écran qui manquait, et il ne
 * fait qu'une chose — demander une adresse et faire partir un lien.
 *
 * **Il ne dit jamais si le compte existe.** GoTrue répond pareil dans les deux
 * cas, et l'écran de confirmation est formulé pour que ce soit vrai à
 * l'affichage aussi (« si un compte existe pour cette adresse ») : un écran qui
 * distinguerait les deux serait un révélateur de comptes, c'est-à-dire la
 * moitié du travail d'un attaquant, offerte.
 *
 * La suite du parcours est ailleurs : le lien reçu passe par `/auth/confirm`
 * (le geste qui ouvre la session, MIN-345) puis par `/reset-password`, où le
 * nouveau mot de passe se choisit.
 */
export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const searchParams = useSearchParams();
  const { sendPasswordReset } = useAuth();
  const { track } = useAnalytics();
  const inDesktopApp = useInDesktopApp();

  // L'adresse déjà tapée sur l'écran de connexion, s'il y en avait une : la
  // faire retaper ici est le genre de friction qui fait abandonner un parcours
  // dont on ne sort, par définition, que par la boîte mail.
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** L'adresse à laquelle un lien vient de partir — l'écran change alors. */
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
      // Aucune prop : l'adresse est une donnée personnelle, et le seul fait
      // intéressant ici est qu'un parcours de reset a démarré.
      track("password_reset_requested", {});
      setSentTo(email.trim());
    } catch (err) {
      // Le refus brut dans la console : l'appel part du navigateur vers
      // Supabase, il n'y a rien à lire côté Vercel. Ce qui remonte vraiment,
      // c'est la limite de débit (`over_email_send_rate_limit`) — traduite.
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
