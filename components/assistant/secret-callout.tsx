"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input } from "mangue-ui";
import { Check, Copy, Eye, EyeOff, KeyRound } from "lucide-react";
import { REDACTED_MARK } from "@/lib/server/agent/redact";
import { ssoEnvLine } from "@/lib/feedback/env-lines";
import {
  integrationKeyEnvLine,
  isIntegrationKind,
} from "@/lib/feedback/integration-contract";

/**
 * L'IDENTIFIANT VIVANT NE PASSE PLUS PAR LA PHRASE DE NUMO (MIN-343).
 *
 * Une clé `mdy_` fraîchement créée, le secret SSO d'un board : ils arrivent au
 * navigateur avec le résultat d'outil, en direct, et nulle part ailleurs — la
 * boucle les substitue avant d'écrire `assistant_messages` et avant de rendre la
 * main au modèle. Le modèle ne les voit donc pas, et ne peut pas les recopier
 * dans sa réponse : c'est cette carte qui les montre, une fois.
 *
 * D'où la forme : la LIGNE de `.env` (`MINDDY_API_KEY=…`), pas la valeur nue —
 * c'est déjà ce que montrent les réglages, et c'est exactement ce que la
 * documentation d'intégration attend là-bas. Rechargez le fil et la carte
 * disparaît : l'historique persisté ne porte que `[redacted]`, ce qui est le but.
 */

/** Le secret porté par un résultat d'outil, s'il est encore VIVANT — un fil
 *  rechargé relit `[redacted]`, et la carte ne s'affiche alors pas du tout. */
export function liveSecretOf(
  toolName: string,
  result: unknown
): { envLine: string } | null {
  const r = result as Record<string, unknown> | undefined;
  if (!r || typeof r !== "object") return null;

  if (toolName === "create_integration") {
    const key = r.key;
    if (typeof key !== "string" || !key || key.includes(REDACTED_MARK)) return null;
    const kind = (r.integration as { kind?: unknown } | undefined)?.kind;
    return {
      envLine: integrationKeyEnvLine(isIntegrationKind(kind) ? kind : "issues", key),
    };
  }

  if (toolName === "configure_feedback_board") {
    const secret = r.sso_secret;
    if (typeof secret !== "string" || !secret || secret.includes(REDACTED_MARK)) {
      return null;
    }
    return { envLine: ssoEnvLine(secret) };
  }

  return null;
}

export function SecretCallout({ envLine }: { envLine: string }) {
  const t = useTranslations("ToolCall");
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand/25 bg-brand/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <KeyRound className="size-3.5 shrink-0" />
        {t("secretShownOnce")}
      </p>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          type={reveal ? "text" : "password"}
          value={envLine}
          className="font-mono text-xs"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={reveal ? t("secretHide") : t("secretReveal")}
          onClick={() => setReveal((r) => !r)}
        >
          {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("secretCopy")}
          onClick={() => {
            void navigator.clipboard.writeText(envLine);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (
            <Check className="size-4 text-emerald-500" />
          ) : (
            <Copy className="size-4" />
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("secretStoreServerSide")}</p>
    </div>
  );
}
