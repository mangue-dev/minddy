"use client";

import { useTranslations } from "next-intl";

import { ApiError } from "@/lib/agent-api";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * An error code from the agent routes → a sentence for the user.
 *
 * The two launching surfaces (the conversation of a ticket, the composer
 * notebook) each held its own table, declaring itself a "mirror" of the one of
 * the other — that is, two places to correct for one more code, and the
 * kind of gap that is only seen on screen. Only one table here.
 *
 * The refusal `modelAbovePlan` is the only one to carry VALUES (which model, to
 * which multiplier, how far the plan goes): the picker already grays the models
 * above the ceiling, so this message only appears to someone whose choice
 * PRECEDES the constraint — a personal default recorded before a downgrade. It doesn't
 * just say "pattern refused".
 */
const AGENT_ERROR_KEYS: Record<string, MessageKey<"Agent">> = {
  noRepo: "errorNoRepo",
  unsupportedProvider: "errorUnsupportedProvider",
  alreadyRunning: "errorAlreadyRunning",
  quotaExceeded: "errorQuotaExceeded",
  managedServiceUnavailable: "errorManagedServiceUnavailable",
  executionBackendUnavailable: "errorExecutionBackendUnavailable",
  noModelForProvider: "errorNoModelForProvider",
  localEndpointRequiresLocalRun: "errorLocalEndpointRequiresLocalRun",
  localIssueConfirmationRequired: "errorLocalIssueConfirmationRequired",
  supersededRun: "errorSupersededRun",
  prMerged: "errorPrMerged",
  promptRequired: "errorPromptRequired",
  promptTooLong: "errorPromptTooLong",
};

export function useAgentErrorMessage() {
  const t = useTranslations("Agent");

  /** Translates an agent API error code, or lets the raw message pass. */
  return (err: unknown): string => {
    const msg = (err as Error).message;
    const details = err instanceof ApiError ? err.details : undefined;
    if (msg === "modelAbovePlan" && details) {
      // The multipliers are in NUMBERS: the “×” is in the message,
      // and next-intl writes the decimal according to the locale (×1.5 / ×1.5).
      return t("errorModelAbovePlan", {
        model: String(details.model ?? ""),
        multiplier: Number(details.multiplier ?? 0),
        limit: Number(details.limit ?? 0),
        plan: planLabel(String(details.planId ?? "")),
      });
    }
    const key = AGENT_ERROR_KEYS[msg];
    return key ? t(key) : msg;
  };
}

/** Displayable name of a plan: its capitalized id (“go” → “Go”). */
function planLabel(id: string): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id;
}
