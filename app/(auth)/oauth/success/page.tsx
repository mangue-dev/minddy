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
import { OAuthSuccessCard } from "@/components/oauth/success-card";

/**
 * “Connection successful” interstitial: displayed just after consent,
 * before the automatic redirection to the client callback (which bears the
 * code). Anti open-redirect: `continue` is only followed if its base
 * (origin + pathname) matches EXACTLY a registered redirect_uri of the
 * client — otherwise error card, no redirection.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await appPageMetadata("oauthSuccess")),
    robots: { index: false, follow: false },
  };
}

/** The base of a callback URI, comparable as is.

 Especially NOT `origin`: on a private native app scheme (`cursor://…`), which
 is not a “special scheme” in the sense of the Standard URL, `origin` is worth the
 string `"null"` — two unrelated URIs would compare equal and the
 control would no longer control anything. */
const callbackBase = (url: URL) => `${url.protocol}//${url.host}${url.pathname}`;

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
      return callbackBase(new URL(registered)) === callbackBase(parsed);
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
    <OAuthSuccessCard clientName={client.client_name} continueUrl={continueUrl} />
  );
}
