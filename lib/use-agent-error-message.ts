"use client";

import { useTranslations } from "next-intl";

import { ApiError } from "@/lib/agent-api";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Un code d'erreur des routes agent → une phrase pour l'utilisateur.
 *
 * Les deux surfaces de lancement (la conversation d'un ticket, le composer
 * carnet) tenaient chacune sa table, en se déclarant « miroir » l'une de
 * l'autre — c'est-à-dire deux endroits à corriger pour un code de plus, et le
 * genre d'écart qui ne se voit qu'à l'écran. Une seule table ici.
 *
 * Le refus `modelAbovePlan` est le seul à porter des VALEURS (quel modèle, à
 * quel multiplicateur, jusqu'où va le plan) : le picker grise déjà les modèles
 * hors plafond, donc ce message n'apparaît qu'à quelqu'un dont le choix
 * PRÉCÈDE la contrainte — un défaut perso enregistré avant un downgrade. Il ne
 * peut pas se contenter de « modèle refusé ».
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
  supersededRun: "errorSupersededRun",
  prMerged: "errorPrMerged",
  promptRequired: "errorPromptRequired",
};

export function useAgentErrorMessage() {
  const t = useTranslations("Agent");

  /** Traduit un code d'erreur d'API agent, ou laisse passer le message brut. */
  return (err: unknown): string => {
    const msg = (err as Error).message;
    const details = err instanceof ApiError ? err.details : undefined;
    if (msg === "modelAbovePlan" && details) {
      // Les multiplicateurs partent en NOMBRES : le « × » est dans le message,
      // et next-intl écrit la décimale selon la locale (×1,5 / ×1.5).
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

/** Nom affichable d'un plan : son id capitalisé (« go » → « Go »). */
function planLabel(id: string): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id;
}
