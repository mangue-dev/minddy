import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "mangue-ui";
import { createServerSupabase } from "@/lib/supabase-server";
import {
  buildCallbackUrl,
  validateAuthorizeRequest,
  type AuthorizeParams,
} from "@/lib/server/oauth/authorize-validation";
import { mapClientNameToAgent } from "@/lib/mcp-agents";
import { displayName } from "@/lib/display-name";
import { toNamed } from "@/lib/server/auth-users";
import { OAuthConsentCard } from "@/components/oauth/consent-card";

/**
 * Page de consentement OAuth (server component, layout (auth) minimal).
 * Le middleware force la connexion (redirect /login avec paramètres
 * préservés) ; ici on valide la requête (RFC 6749) et on rend la carte
 * d'autorisation partagée. Client inconnu / redirect_uri non enregistré →
 * carte d'erreur, JAMAIS de redirection (anti open-redirect).
 */

export const dynamic = "force-dynamic";

async function publicOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

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

  const origin = await publicOrigin();
  const validation = await validateAuthorizeRequest(params, origin);

  if (validation.kind === "error_redirect") {
    redirect(
      buildCallbackUrl(validation.redirectUri, {
        error: validation.error,
        error_description: validation.errorDescription,
        state: validation.state,
      })
    );
  }

  if (validation.kind === "fatal") {
    return (
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display text-xl tracking-tight">
            {t("errorTitle")}
          </CardTitle>
          <CardDescription>
            {validation.reason === "unknown_client"
              ? t("unknownClient")
              : t("invalidRedirect")}
          </CardDescription>
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
      agentId={mapClientNameToAgent(client.client_name)}
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
