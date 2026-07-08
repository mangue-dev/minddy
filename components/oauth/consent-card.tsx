import { getTranslations } from "next-intl/server";
import { Button, Card, CardContent } from "mangue-ui";
import { Check } from "lucide-react";
import { OAuthLogoPair } from "@/components/oauth/logo-pair";

/**
 * Carte de consentement OAuth — présentationnelle, rendue par la page
 * /oauth/authorize.
 */
export interface ConsentFormFields {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  state: string | null;
  resource: string | null;
}

export async function OAuthConsentCard({
  clientName,
  agentId,
  userLabel,
  fields,
}: {
  clientName: string;
  agentId: string | null;
  userLabel: string;
  fields: ConsentFormFields;
}) {
  const t = await getTranslations("OAuthConsent");

  return (
    <Card className="w-full max-w-md rounded-2xl">
      <CardContent className="flex flex-col gap-6 px-8 py-8">
        <OAuthLogoPair agentId={agentId} />

        <div className="flex flex-col gap-1 text-center">
          <h1 className="font-display text-xl font-semibold tracking-tight">
            {clientName}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <ul className="flex flex-col gap-2.5 rounded-xl bg-muted/40 px-4 py-3.5 text-sm">
          {[t("scopeIssues"), t("scopeActAs")].map((scope) => (
            <li key={scope} className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={2.5} />
              <span className="text-foreground/90">{scope}</span>
            </li>
          ))}
        </ul>

        <form method="POST" action="/api/oauth/authorize" className="flex gap-2">
          <input type="hidden" name="client_id" value={fields.clientId} />
          <input type="hidden" name="redirect_uri" value={fields.redirectUri} />
          <input type="hidden" name="code_challenge" value={fields.codeChallenge} />
          <input type="hidden" name="code_challenge_method" value="S256" />
          <input type="hidden" name="scope" value={fields.scope} />
          {fields.state !== null && (
            <input type="hidden" name="state" value={fields.state} />
          )}
          {fields.resource !== null && (
            <input type="hidden" name="resource" value={fields.resource} />
          )}
          <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">
            {t("deny")}
          </Button>
          <Button type="submit" name="decision" value="approve" className="flex-1">
            {t("authorize")}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          {t("signedInAs", { name: userLabel })}
        </p>
      </CardContent>
    </Card>
  );
}
