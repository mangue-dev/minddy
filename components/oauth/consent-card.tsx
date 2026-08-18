import { getTranslations } from "next-intl/server";
import { Button, Card, CardContent } from "mangue-ui";
import { Check, ShieldAlert } from "lucide-react";
import { OAuthLogoPair } from "@/components/oauth/logo-pair";

/**
 * OAuth consent card — presentational, rendered by the page
 * /oauth/authorize.
 *
 * What the screen should say, and did not say (MIN-346): client registration is OPEN, so `client_name` is a string that anyone
 * chooses. The card displayed this name under the real logo of the seller of the same name,
 * without ever showing the address to which the account would go. We now show
 * the return address in plain text — it's the only thing on this
 * screen that the user can actually recognize —, we say that the name
 * is not verified, and we list what the unique scope really grants.
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
  userLabel,
  fields,
}: {
  clientName: string;
  userLabel: string;
  fields: ConsentFormFields;
}) {
  const t = await getTranslations("OAuthConsent");
  const redirectHost = hostOf(fields.redirectUri);

  return (
    <Card className="w-full max-w-md rounded-2xl">
      <CardContent className="flex flex-col gap-6 px-8 py-8">
        <OAuthLogoPair />

        <div className="flex flex-col gap-1 text-center">
          <h1 className="font-display text-xl font-semibold tracking-tight">
            {clientName}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <ul className="flex flex-col gap-2.5 rounded-xl bg-muted/40 px-4 py-3.5 text-sm">
          {[
            t("scopeIssues"),
            t("scopeActAs"),
            t("scopeIntegrations"),
            t("scopeAgents"),
          ].map((scope) => (
            <li key={scope} className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={2.5} />
              <span className="text-foreground/90">{scope}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3.5">
          <p className="flex items-start gap-2.5 text-sm text-foreground/90">
            <ShieldAlert
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500"
              strokeWidth={2.25}
            />
            <span>
              {redirectHost
                ? t("redirectTo", { host: redirectHost })
                : t("redirectToUnknownHost")}
            </span>
          </p>
          {/* The entire URI, never truncated: this is the only verifiable
 element on the screen. `break-all` because a callback has no spaces. */}
          <p className="break-all rounded-lg bg-background/70 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
            {fields.redirectUri}
          </p>
          <p className="text-xs text-muted-foreground">{t("nameNotVerified")}</p>
        </div>

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

/** Host of the return URI, when it has one. A private native app schema
 (`cursor://…`, `com.example.app:/cb`) doesn't always have one: in this case on
 doesn't pretend to name one, the full URI below does the job. */
function hostOf(uri: string): string | null {
  try {
    return new URL(uri).host || null;
  } catch {
    return null;
  }
}
