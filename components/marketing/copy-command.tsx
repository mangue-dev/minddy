"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { IconButton, toast } from "mangue-ui";

/** Ligne de commande copiable — la commande d'installation MCP de la landing.
    Aucun secret dedans (l'agent passe par OAuth au premier appel), donc elle
    peut être affichée telle quelle à des visiteurs anonymes. */
export function CopyCommand({ command }: { command: string }) {
  const t = useTranslations("Landing");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success(t("agentsCommandCopied"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-card p-1 pl-3 shadow-sm">
      {/* min-w-0 : sans lui, l'élément flex refuse de descendre sous la largeur
          de la commande (min-width: auto), la carte s'élargit et toute la page
          scrolle latéralement sur mobile. */}
      <code className="min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-xs whitespace-nowrap text-foreground/90">
        {command}
      </code>
      <IconButton
        aria-label={t("agentsCopyCommand")}
        onClick={copy}
        variant="ghost"
        size="sm"
        className="shrink-0"
      >
        {copied ? <Check className="text-emerald-500" /> : <Copy />}
      </IconButton>
    </div>
  );
}
