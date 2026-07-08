import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "mangue-ui";
import { OAuthLogoPair } from "@/components/oauth/logo-pair";
import { AutoRedirect } from "@/components/oauth/auto-redirect";

/**
 * Carte « connexion réussie » — interstitiel affiché après le consentement,
 * juste avant le retour vers le client (redirection automatique + lien
 * manuel).
 */
export async function OAuthSuccessCard({
  clientName,
  agentId,
  continueUrl,
}: {
  clientName: string;
  agentId: string | null;
  continueUrl: string;
}) {
  const t = await getTranslations("OAuthConsent");

  return (
    <Card className="w-full max-w-md rounded-2xl">
      <CardContent className="flex flex-col gap-6 px-8 py-8">
        <OAuthLogoPair agentId={agentId} state="success" />

        <div className="flex flex-col gap-1 text-center">
          <h1 className="font-display text-xl font-semibold tracking-tight">
            {t("successTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("successBody", { name: clientName })}
          </p>
        </div>

        <AutoRedirect url={continueUrl} delayMs={1400} />
        <a
          href={continueUrl}
          className="text-center text-xs font-medium text-brand underline-offset-4 hover:underline"
        >
          {t("successContinue", { name: clientName })}
        </a>
      </CardContent>
    </Card>
  );
}
