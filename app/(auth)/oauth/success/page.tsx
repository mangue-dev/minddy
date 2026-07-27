import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "mangue-ui";
import { appPageMetadata } from "@/lib/app-metadata";
import { getClient } from "@/lib/server/oauth/clients";
import { mapClientNameToAgent } from "@/lib/mcp-agents";
import { OAuthSuccessCard } from "@/components/oauth/success-card";

/**
 * Interstitiel « connexion réussie » : affiché juste après le consentement,
 * avant la redirection automatique vers le callback du client (qui porte le
 * code). Anti open-redirect : `continue` n'est suivi que si sa base
 * (origin + pathname) correspond EXACTEMENT à un redirect_uri enregistré du
 * client — sinon carte d'erreur, aucune redirection.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await appPageMetadata("oauthSuccess")),
    robots: { index: false, follow: false },
  };
}

function continueMatchesClient(
  continueUrl: string,
  redirectUris: string[]
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(continueUrl);
  } catch {
    return false;
  }
  return redirectUris.some((registered) => {
    try {
      const base = new URL(registered);
      return base.origin === parsed.origin && base.pathname === parsed.pathname;
    } catch {
      return false;
    }
  });
}

export default async function OAuthSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("OAuthConsent");
  const raw = await searchParams;
  const clientId = typeof raw.client_id === "string" ? raw.client_id : null;
  const continueUrl = typeof raw.continue === "string" ? raw.continue : null;

  const client = await getClient(clientId);
  const valid =
    client && continueUrl && continueMatchesClient(continueUrl, client.redirect_uris);

  if (!valid) {
    return (
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display text-xl tracking-tight">
            {t("errorTitle")}
          </CardTitle>
          <CardDescription>{t("invalidRedirect")}</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  return (
    <OAuthSuccessCard
      clientName={client.client_name}
      agentId={mapClientNameToAgent(client.client_name)}
      continueUrl={continueUrl}
    />
  );
}
