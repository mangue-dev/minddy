"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
  toast,
} from "mangue-ui";
import { Copy } from "lucide-react";
import { MCP_AGENTS, type McpAgent } from "@/lib/mcp-agents";
import { BrandLogo } from "@/components/brand-logo";

/** « Connecter un agent » — OAuth uniquement : la commande d'installation ne
    contient AUCUN secret (l'agent ouvre le navigateur pour autoriser à la
    première utilisation). Copie 100 % côté client, rien à générer.

    UNE question à la fois : la grille demande quel agent, le dialog donne sa
    commande. Tout tenait auparavant dans le même cadre — sélecteur, commande,
    bouton et explication empilés — et plus rien ne s'y lisait.

    Le même composant sert les réglages du compte (`account-mcp-section.tsx`) et
    l'étape MCP de l'onboarding (`components/home/onboarding-mcp-step.tsx`), qui
    n'y ajoute que sa sortie « Passer cette étape ». */
export function McpConnectPanel({
  className,
  onSelect,
  onConnected,
}: {
  className?: string;
  /** L'agent vient d'être choisi — l'onboarding s'en sert pour l'analytics. */
  onSelect?: (agent: McpAgent) => void;
  /** Le dialog s'est fermé sur « C'est connecté ». */
  onConnected?: () => void;
}) {
  const t = useTranslations("Account");
  const [agent, setAgent] = useState<McpAgent | null>(null);

  const select = (next: McpAgent) => {
    onSelect?.(next);
    setAgent(next);
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        role="group"
        aria-label={t("mcpAgentPicker")}
      >
        {MCP_AGENTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => select(item)}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:bg-brand/8 focus-visible:border-ring focus-visible:outline-none"
          >
            <BrandLogo brand={item} className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{item.label}</span>
          </button>
        ))}
      </div>

      <Dialog open={agent !== null} onOpenChange={(open) => !open && setAgent(null)}>
        <DialogContent className="sm:max-w-lg">
          {agent && (
            <>
              <DialogHeader>
                <DialogTitle>{t("mcpDialogTitle", { name: agent.label })}</DialogTitle>
                <DialogDescription>
                  {t("mcpDialogDesc", { name: agent.label })}
                </DialogDescription>
              </DialogHeader>

              <McpAgentInstall agent={agent} />

              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    setAgent(null);
                    onConnected?.();
                  }}
                >
                  {t("mcpDialogDone")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** L'artefact d'un agent et le geste qui va avec : une commande à coller, un
    bloc de config, l'URL du serveur, ou un lien d'installation en un clic. */
function McpAgentInstall({ agent }: { agent: McpAgent }) {
  const t = useTranslations("Account");

  // window n'existe qu'au client ; rendu après mount pour éviter tout mismatch.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  if (!origin) return null;
  const endpoint = `${origin}/api/mcp`;

  const act = async () => {
    await navigator.clipboard.writeText(agent.build(endpoint));
    toast.success(
      agent.kind === "config"
        ? t("configCopied")
        : agent.kind === "url"
          ? t("urlCopied")
          : t("commandCopied")
    );
  };

  const actionLabel =
    agent.kind === "config"
      ? t("copyInstallConfig")
      : agent.kind === "url"
        ? t("copyServerUrl")
        : t("copyInstallCommand");

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
      {/* `w-full min-w-0` : sans eux, `whitespace-pre` impose au bloc sa
          largeur min-content — celle de la commande entière, sur une ligne —
          et le dialog se fait élargir par son propre contenu au lieu de le
          laisser défiler. */}
      <code className="max-h-40 w-full min-w-0 overflow-auto whitespace-pre rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
        {agent.build(endpoint)}
      </code>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void act()}>
          <Copy />
          {actionLabel}
        </Button>
        <p className="text-xs text-muted-foreground">{t(agent.hint)}</p>
      </div>
    </div>
  );
}
