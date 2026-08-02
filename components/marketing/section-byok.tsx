import { getTranslations } from "next-intl/server";
import { KeyRound, Layers, Lock } from "lucide-react";
import { AGENT_PROVIDERS } from "@/lib/agent-providers";

/**
 * « Votre clé, votre inférence » — l'argument central de la page tarifs
 * (MIN-149).
 *
 * Il était enterré en dernière question de la FAQ, formulé comme une concession
 * (« oui, on peut utiliser sa propre clé »). Pour la cible — un dev qui code
 * avec des agents toute la journée et qui a DÉJÀ une clé — c'est le titre :
 * l'abonnement achète minddy, l'inférence de l'agent peut rester chez lui. Dit
 * ici, il retire aussi de la page la conversation « tant d'euros pour tant de
 * dollars d'usage inclus », et découple la marge du prix des modèles.
 *
 * CE QU'IL NE FAUT PAS LUI FAIRE DIRE. Le BYOK ne couvre que la boucle de
 * l'agent de code — `resolveAgentApiKey` (lib/server/agent/model.ts) n'est
 * appelé que par `execute.ts`. Numo dans l'app, la review de PR, la dictée et le
 * feedback tournent sur la clé plateforme et se décomptent de l'usage inclus. Et
 * la clé ne lève pas la garde de plan : `checkAgentQuota` refuse un run sans
 * `allowAgents`. Ces deux réserves tiennent dans la note de bas de section, et
 * elles y restent tant que le code n'a pas changé.
 *
 * Les providers viennent du registre (`AGENT_PROVIDERS`), comme le wizard des
 * réglages : en ajouter un le fait apparaître ici. Le générique est écarté de la
 * liste (`requiresBaseUrl`) — ce n'est pas une marque, il se dit en prose.
 *
 * Pas de logos : `ProviderLogo` est un composant client qui tire
 * `@lobehub/icons`, et cette page est publique.
 */

const POINTS = [
  { key: "uncapped", icon: KeyRound },
  { key: "catalog", icon: Layers },
  { key: "safe", icon: Lock },
] as const;

export async function SectionByok() {
  const t = await getTranslations("Pricing");
  const providers = AGENT_PROVIDERS.filter((provider) => !provider.requiresBaseUrl);

  return (
    <section id="byok" className="scroll-mt-24 border-t border-border py-16 sm:py-20">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <header className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {t("byokTitle")}
          </h2>
          <p className="leading-relaxed text-pretty text-muted-foreground">
            {t("byokSubtitle")}
          </p>
        </header>

        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <ul className="flex flex-wrap justify-center gap-2">
            {providers.map((provider) => (
              <li
                key={provider.id}
                className="rounded-full border border-border bg-muted/40 px-3.5 py-1.5 text-sm font-medium text-foreground/90"
              >
                {provider.label}
              </li>
            ))}
            <li className="rounded-full border border-dashed border-border px-3.5 py-1.5 text-sm text-muted-foreground">
              {t("byokGeneric")}
            </li>
          </ul>

          <ul className="mt-8 grid gap-6 sm:grid-cols-3">
            {POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <li key={point.key} className="flex flex-col gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <h3 className="font-medium">{t(`byok_${point.key}_title`)}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`byok_${point.key}_body`)}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Les deux réserves, sous le cadre et non dedans : elles bornent
            l'argument, elles ne le portent pas. */}
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
          {t("byokNote")}
        </p>
      </div>
    </section>
  );
}
