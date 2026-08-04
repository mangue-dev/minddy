"use client";

import { useTranslations } from "next-intl";
import { Checkbox, Input } from "mangue-ui";
import { Boxes, Plug } from "lucide-react";
import { WizardChoiceCard } from "@/components/wizard/wizard-choice-card";
import type { WizardStep } from "@/components/wizard/wizard-dialog";
import {
  isDeliverableWebhookUrl,
  normalizeWebhookUrl,
} from "@/lib/webhook-url";
import type {
  IntegrationWebhookEvent,
  IntegrationWebhookScope,
} from "@/lib/types";

/**
 * Les trois écrans du webhook sortant — où appeler, sur quoi, pour quels
 * tickets — définis une fois pour les deux endroits qui les montrent : la
 * création d'une intégration, et la reconfiguration d'un webhook existant.
 *
 * Ce sont les mêmes questions, posées au même moment du parcours ; les laisser
 * diverger, c'est que le libellé d'un événement ou la valeur par défaut d'un
 * périmètre ne veuille plus dire la même chose selon la porte d'entrée.
 *
 * Ce qui change d'un hôte à l'autre est ce qui ENTOURE les questions. À la
 * création, une question préalable décide si ces trois écrans existent — donc
 * arriver ici, c'est avoir dit oui, et l'URL est attendue. En reconfiguration,
 * les trois écrans sont toujours là et vider l'URL est la façon d'éteindre.
 */

export type WebhookStepId = "webhookUrl" | "webhookEvents" | "webhookScope";

export interface WebhookConfig {
  /** Vide = pas de webhook. */
  url: string;
  events: IntegrationWebhookEvent[];
  scope: IntegrationWebhookScope;
}

const ALL_EVENTS: IntegrationWebhookEvent[] = [
  "issue.created",
  "issue.status_changed",
  "issue.updated",
];

/** Ce qu'on suit quand on n'a rien dit : le changement de statut, c'est-à-dire
 *  la décision humaine — la seule chose qu'une app ne peut pas déduire seule. */
export const DEFAULT_WEBHOOK: WebhookConfig = {
  url: "",
  events: ["issue.status_changed"],
  scope: "integration",
};

export function useWebhookSteps({
  value,
  onChange,
  /**
   * On est ici parce qu'on a dit oui : une URL vide n'est plus « pas de
   * webhook » mais une réponse manquante. Là où l'on RECONFIGURE, au
   * contraire, la vider est la façon d'éteindre.
   */
  urlRequired = false,
  /** CTA de la dernière étape, quand elle termine le parcours. */
  scopeSubmitLabel,
}: {
  value: WebhookConfig;
  onChange: (next: WebhookConfig) => void;
  urlRequired?: boolean;
  scopeSubmitLabel?: string;
}): Record<WebhookStepId, WizardStep<WebhookStepId>> {
  const t = useTranslations("Settings");
  const hasUrl = !!value.url.trim();
  const urlOk =
    hasUrl && isDeliverableWebhookUrl(normalizeWebhookUrl(value.url));

  const toggleEvent = (event: IntegrationWebhookEvent, checked: boolean) =>
    onChange({
      ...value,
      events: checked
        ? [...new Set([...value.events, event])]
        : value.events.filter((e) => e !== event),
    });

  return {
    webhookUrl: {
      id: "webhookUrl",
      title: t("webhookWizardUrlTitle"),
      subtitle: t("webhookDescription"),
      // Vide, elle ne bloque que là où une adresse est attendue ; remplie, elle
      // doit être appelable — sans quoi on enregistre un webhook qui n'appellera
      // rien, et on ne l'apprendrait qu'en ne recevant jamais de livraison.
      submitDisabled: hasUrl ? !urlOk : urlRequired,
      content: (
        <div className="flex flex-col gap-2 text-left">
          {/* `type="url"` refuserait « example.com » avant même d'arriver
              jusqu'ici : la validation native se déclenche à la soumission, donc
              avant que le schéma manquant ait pu être ajouté. C'est nous qui
              validons, et `inputMode` garde le bon clavier sur mobile. */}
          <Input
            autoFocus
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
            // Compléter à la sortie du champ, pas à la frappe : réécrire sous
            // les doigts de qui tape empêcherait d'écrire « http://… ».
            onBlur={() => {
              const normalized = normalizeWebhookUrl(value.url);
              if (normalized !== value.url)
                onChange({ ...value, url: normalized });
            }}
            placeholder="https://example.com/minddy-webhook"
            aria-label={t("webhookUrlLabel")}
            className="font-mono text-sm"
          />
          {/* « Laissez vide pour désactiver » ne veut rien dire quand il n'y a
              rien à désactiver : à la création, l'URL est attendue. */}
          {!urlRequired && (
            <p className="text-xs text-muted-foreground">
              {t("webhookUrlHint")}
            </p>
          )}
          {/* Ce que le récepteur doit vérifier, à l'endroit où on lui donne
              l'adresse : la signature est la seule chose qu'il ne peut pas
              déduire de la charge utile. */}
          <p className="mt-2 rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            {t("webhookSignatureHint")}
          </p>
        </div>
      ),
    },

    webhookEvents: {
      id: "webhookEvents",
      title: t("webhookWizardEventsTitle"),
      subtitle: t("webhookWizardEventsDesc"),
      // Une URL sans événement suivi n'appellera jamais : c'est un webhook qui
      // a l'air branché et ne l'est pas.
      submitDisabled: hasUrl && value.events.length === 0,
      content: (
        <div className="flex flex-col gap-3">
          {ALL_EVENTS.map((event) => (
            <label
              key={event}
              className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border p-4"
            >
              <span className="flex min-w-0 flex-col gap-0.5 text-left">
                <span className="text-sm font-medium">
                  {t(
                    `webhookEvent_${event.replace(".", "_")}` as Parameters<
                      typeof t
                    >[0],
                  )}
                </span>
                <code className="font-mono text-xs text-muted-foreground">
                  {event}
                </code>
              </span>
              <Checkbox
                checked={value.events.includes(event)}
                onCheckedChange={(checked) =>
                  toggleEvent(event, checked === true)
                }
              />
            </label>
          ))}
        </div>
      ),
    },

    webhookScope: {
      id: "webhookScope",
      title: t("webhookWizardScopeTitle"),
      wide: true,
      submitLabel: scopeSubmitLabel,
      content: (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t("webhookScopeLabel")}
        >
          <WizardChoiceCard
            selected={value.scope === "integration"}
            icon={Plug}
            label={t("webhookScopeIntegrationLabel")}
            description={t("webhookScopeIntegration")}
            onSelect={() => onChange({ ...value, scope: "integration" })}
          />
          <WizardChoiceCard
            selected={value.scope === "all"}
            icon={Boxes}
            label={t("webhookScopeAllLabel")}
            description={t("webhookScopeAll")}
            onSelect={() => onChange({ ...value, scope: "all" })}
          />
        </div>
      ),
    },
  };
}
