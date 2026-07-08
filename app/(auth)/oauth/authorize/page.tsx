import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Button,
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
import { getMcpAgent, mapClientNameToAgent } from "@/lib/mcp-agents";
import { displayName } from "@/lib/display-name";

/**
 * Page de consentement OAuth (server component, layout (auth) minimal).
 * Le middleware force la connexion (redirect /login avec paramètres
 * préservés) ; ici on valide la requête (RFC 6749) et on rend la carte
 * d'autorisation. Client inconnu / redirect_uri non enregistré → carte
 * d'erreur, JAMAIS de redirection (anti open-redirect).
 */

export const dynamic = "force-dynamic";

async function publicOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Logo de l'agent deviné depuis le client_name — jamais le logo_uri fourni
    par le client (surface d'injection). */
function AgentLogoStatic({ clientName }: { clientName: string }) {
  const agentId = mapClientNameToAgent(clientName);
  if (!agentId) return null;
  const agent = getMcpAgent(agentId);
  return (
    <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted/40">
      {agent.logoDark ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={agent.logo} alt="" className="size-7 dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={agent.logoDark} alt="" className="hidden size-7 dark:block" />
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={agent.logo} alt="" className="size-7" />
      )}
    </span>
  );
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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-2xl tracking-tight">minddy</CardTitle>
          <CardDescription>{t("errorTitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {validation.reason === "unknown_client"
              ? t("unknownClient")
              : t("invalidRedirect")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { client, redirectUri, codeChallenge, scope, resource, state } = validation;
  const userLabel = displayName({
    full_name:
      typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : null,
    email: user.email,
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="flex items-center gap-3">
          <AgentLogoStatic clientName={client.client_name} />
          <div className="min-w-0">
            <CardTitle className="truncate text-lg leading-snug">
              {t("title", { name: client.client_name })}
            </CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <li>• {t("scopeIssues")}</li>
          <li>• {t("scopeActAs")}</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          {t("signedInAs", { name: userLabel })}
        </p>
        <form method="POST" action="/api/oauth/authorize" className="flex gap-2">
          <input type="hidden" name="client_id" value={client.client_id} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="code_challenge" value={codeChallenge} />
          <input type="hidden" name="code_challenge_method" value="S256" />
          <input type="hidden" name="scope" value={scope} />
          {state !== null && <input type="hidden" name="state" value={state} />}
          {resource !== null && <input type="hidden" name="resource" value={resource} />}
          <Button
            type="submit"
            name="decision"
            value="deny"
            variant="outline"
            className="flex-1"
          >
            {t("deny")}
          </Button>
          <Button type="submit" name="decision" value="approve" className="flex-1">
            {t("authorize")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
