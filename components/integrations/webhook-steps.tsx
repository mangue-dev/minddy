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
 * The three screens of the outgoing webhook — where to call, on what, for what
 * tickets — defined once for the two places that show them: the
 * creating an integration, and reconfiguring an existing webhook.
 *
 * These are the same questions, asked at the same moment of the journey; leave them
 * diverge is that the label of an event or the default value of an
 * perimeter no longer means the same thing depending on the entrance door.
 *
 * What changes from host to host is what SURROUNDS the questions. To the
 * creation, a preliminary question decides if these three screens exist — therefore
 * getting here means saying yes, and the URL is expected. In reconfiguration,
 * all three screens are still there and emptying the url is the way to turn it off.
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

/** What we follow when we have said nothing: the change of status, that is to say
 * human decision — the one thing an app can't deduce on its own. */
export const DEFAULT_WEBHOOK: WebhookConfig = {
  url: "",
  events: ["issue.status_changed"],
  scope: "integration",
};

export function useWebhookSteps({
  value,
  onChange,
  /**
   * We are here because we said yes: an empty URL is no longer "no
   * webhook” but a missing response. Where we RECONFIGURE, at
   * On the contrary, emptying it is the way to extinguish it.
   */
  urlRequired = false,
  /** CTA of the last stage, when she finishes the route. */
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
      // Empty, it only blocks where an address is expected; filled, she
      // must be callable — otherwise we register a webhook which will not call
      // nothing, and we would only learn it by never receiving a delivery.
      submitDisabled: hasUrl ? !urlOk : urlRequired,
      content: (
        <div className="flex flex-col gap-2 text-left">
          {/* `type="url"` would refuse “example.com” before even arriving
 so far: native validation triggers on submission, so
 before the missing schema could be added. We are the ones who validate
, and `inputMode` keeps the correct keyboard on mobile. */}
          <Input
            autoFocus
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
            // Complete when leaving the field, not when typing: rewrite under
            // the typing fingers would prevent writing “http://…”.
            onBlur={() => {
              const normalized = normalizeWebhookUrl(value.url);
              if (normalized !== value.url)
                onChange({ ...value, url: normalized });
            }}
            placeholder="https://example.com/minddy-webhook"
            aria-label={t("webhookUrlLabel")}
            className="font-mono text-sm"
          />
          {/* “Leave blank to disable” means nothing when there is no
 nothing to disable: upon creation, the URL is expected. */}
          {!urlRequired && (
            <p className="text-xs text-muted-foreground">
              {t("webhookUrlHint")}
            </p>
          )}
          {/* What the receiver must check, at the place where he is given
 the address: the signature is the only thing it cannot deduce from the payload. */}
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
      // A URL without a tracked event will never call: it is a webhook which
      // looks hip and isn't.
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
