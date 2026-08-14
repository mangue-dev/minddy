import { getTranslations } from "next-intl/server";
import { Button, Card, CardContent } from "mangue-ui";
import { Check, ShieldAlert } from "lucide-react";
import { OAuthLogoPair } from "@/components/oauth/logo-pair";

/**
 * Carte de consentement OAuth — présentationnelle, rendue par la page
 * /oauth/authorize.
 *
 * Ce que l'écran doit dire, et ne disait pas (MIN-346) : l'inscription des
 * clients est OUVERTE, donc `client_name` est une chaîne que n'importe qui
 * choisit. La carte affichait ce nom sous le vrai logo du vendeur homonyme,
 * sans jamais montrer l'adresse à laquelle le compte allait partir. On montre
 * maintenant l'adresse de retour en clair — c'est la seule chose de cet écran
 * que l'utilisateur puisse effectivement reconnaître —, on dit que le nom
 * n'est pas vérifié, et on énumère ce que le scope unique accorde vraiment.
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
          {/* L'URI entière, jamais tronquée : c'est le seul élément vérifiable
              de l'écran. `break-all` parce qu'un callback n'a pas d'espaces. */}
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

/** Hôte de l'URI de retour, quand elle en a un. Un schéma privé d'app native
    (`cursor://…`, `com.example.app:/cb`) n'en a pas toujours : dans ce cas on
    ne prétend pas en nommer un, l'URI complète en dessous fait le travail. */
function hostOf(uri: string): string | null {
  try {
    return new URL(uri).host || null;
  } catch {
    return null;
  }
}
