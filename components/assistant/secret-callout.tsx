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
 * THE LIVING IDENTIFIER NO LONGER GOES THROUGH THE PHRASE OF NUMO (MIN-343).
 *
 * A freshly created `mdy_` key, the SSO secret of a board: they arrive at
 * browser with the tool result, live, and nowhere else — the
 * loop substitutes them before writing `assistant_messages` and before returning the
 * hand to model. The model therefore does not see them, and cannot copy them
 * in his response: it's this card that shows them, once.
 *
 * Hence the form: LINE of `.env` (`MINDDY_API_KEY=…`), not the bare value —
 * This is already what the settings show, and this is exactly what the
 * Integration documentation is waiting there. Reload the wire and card
 * disappears: the persisted history only carries `[redacted]`, which is the goal.
 */

/** The secret carried by a tool result, if it is still ALIVE — a thread
 * reloaded reads `[redacted]` again, and the card is then not displayed at all. */
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
