import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "mangue-ui";
import { appPageMetadata } from "@/lib/app-metadata";
import { createServerSupabase } from "@/lib/supabase-server";
import {
  validateAuthorizeRequest,
  type AuthorizeFailure,
  type AuthorizeParams,
} from "@/lib/server/oauth/authorize-validation";
import { oauthIssuer } from "@/lib/server/oauth/issuer";
import type { MessageKey } from "@/lib/i18n-keys";
import { displayName } from "@/lib/display-name";
import { toNamed } from "@/lib/server/auth-users";
import { OAuthConsentCard } from "@/components/oauth/consent-card";

/**
 * Page de consentement OAuth (server component, layout (auth) minimal).
 * Le middleware force la connexion (redirect /login avec paramètres
 * préservés) ; ici on valide la requête (RFC 6749) et on rend la carte
 * d'autorisation partagée.
 *
 * Toute requête invalide — client inconnu, redirect_uri non enregistré, mais
 * aussi le moindre paramètre de protocole hors gabarit — s'arrête sur la carte
 * d'erreur. JAMAIS de redirection : l'inscription des clients est ouverte,
 * donc une URI « enregistrée » n'est qu'une URI qu'un inconnu a déposée, et
 * rediriger dessus ferait de cette page un redirecteur ouvert (MIN-346).
 */

export const dynamic = "force-dynamic";

// Écran de consentement : rien à indexer, et surtout rien à suivre — les seuls
// liens qu'il porte sont les `redirect_uri` du client OAuth.
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await appPageMetadata("oauthAuthorize")),
    robots: { index: false, follow: false },
  };
}

/** Une phrase par motif : ce qui a échoué, et quoi faire. */
const FAILURE_MESSAGE: Record<AuthorizeFailure, MessageKey<"OAuthConsent">> = {
  unknown_client: "unknownClient",
  invalid_redirect_uri: "invalidRedirect",
  unsupported_response_type: "invalidProtocol",
  invalid_code_challenge: "invalidProtocol",
  invalid_scope: "invalidScope",
  invalid_resource: "invalidResource",
};

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("OAuthConsent");

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const raw = await searchParams;
  // Rejeter les valeurs répétées (?scope=a&scope=b) : premières gagnent.
  const params: AuthorizeParams = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  if (!user) {
    // Filet de sécurité — le middleware fait normalement ce travail.
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
    );
    redirect(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  const validation = await validateAuthorizeRequest(params, oauthIssuer());

  if (validation.kind === "invalid") {
    return (
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display text-xl tracking-tight">
            {t("errorTitle")}
          </CardTitle>
          <CardDescription>{t(FAILURE_MESSAGE[validation.reason])}</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  const { client, redirectUri, codeChallenge, scope, resource, state } = validation;
  // toNamed = même chaîne de résolution que partout ailleurs (display_name →
  // full_name → name), donc un compte Google/GitHub s'affiche avec son nom.
  const userLabel = displayName(toNamed(user));

  return (
    <OAuthConsentCard
      clientName={client.client_name}
      userLabel={userLabel}
      fields={{
        clientId: client.client_id,
        redirectUri,
        codeChallenge,
        scope,
        state,
        resource,
      }}
    />
  );
}
