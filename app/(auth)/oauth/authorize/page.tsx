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
 * The middleware forces the connection (redirect /login with parameters
 * preserved); here we validate the request (RFC 6749) and return the card
 * shared permission.
 *
 * Any invalid request — unknown client, redirect_uri not registered, but
 * also the slightest protocol parameter out of template — stops on the card
 * of error. NEVER redirected: customer registration is open,
 * so a "registered" URI is just a URI that an unknown person filed, and
 * redirecting to it would turn this page into an open redirector (MIN-346).
 */

export const dynamic = "force-dynamic";

// Consent screen: nothing to index, and above all nothing to follow — the only ones
// The links it carries are the `redirect_uri` of the OAuth client.
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await appPageMetadata("oauthAuthorize")),
    robots: { index: false, follow: false },
  };
}

/** One sentence per reason: what failed, and what to do. */
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
  // Reject repeated values ​​(?scope=a&scope=b): first wins.
  const params: AuthorizeParams = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  if (!user) {
    // Safety net — middleware normally does this job.
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
  // toNamed = same resolution string as everywhere else (display_name →
  // full_name → name), so a Google/GitHub account is displayed with its name.
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
