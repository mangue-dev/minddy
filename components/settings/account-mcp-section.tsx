"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, cn, toast } from "mangue-ui";
import { Copy, ExternalLink } from "lucide-react";
import { MCP_AGENTS, type McpAgent } from "@/lib/mcp-agents";
import { SettingsSection } from "@/components/settings-shell";
import { AgentLogo } from "@/components/settings/agent-logo";

/** « Connecter un agent » — OAuth uniquement : la commande d'installation ne
    contient AUCUN secret (l'agent ouvre le navigateur pour autoriser à la
    première utilisation). Copie 100 % côté client, rien à générer. */
export function AccountMcpSection() {
  const t = useTranslations("Account");
  const [selected, setSelected] = useState(MCP_AGENTS[0]);

  // window n'existe qu'au client ; rendu après mount pour éviter tout mismatch.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  if (!origin) return null;
  const endpoint = `${origin}/api/mcp`;

  const act = async (agent: McpAgent) => {
    const artifact = agent.build(endpoint);
    if (agent.kind === "deeplink") {
      window.location.href = artifact;
      toast.success(t("openingAgent", { name: agent.label }));
      return;
    }
    await navigator.clipboard.writeText(artifact);
    toast.success(agent.kind === "config" ? t("configCopied") : t("commandCopied"));
  };

  const actionLabel =
    selected.kind === "deeplink"
      ? t("installIn", { name: selected.label })
      : selected.kind === "config"
        ? t("copyInstallConfig")
        : t("copyInstallCommand");
  const hint =
    selected.kind === "deeplink"
      ? t("mcpHintCursor")
      : selected.kind === "config"
        ? t("mcpHintWindsurf")
        : t("mcpHintCommand");

  return (
    <SettingsSection title={t("mcpSectionTitle")} description={t("mcpSectionDesc")}>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={t("mcpAgentPicker")}
        >
          {MCP_AGENTS.map((agent) => {
            const active = agent.id === selected.id;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => setSelected(agent)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-brand/40 bg-brand/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                <AgentLogo agent={agent} className="size-4" />
                {agent.label}
              </button>
            );
          })}
        </div>

        {selected.kind !== "deeplink" && (
          <code className="max-h-40 overflow-auto whitespace-pre rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
            {selected.build(endpoint)}
          </code>
        )}

        <div className="flex items-center gap-3">
          <Button type="button" onClick={() => void act(selected)}>
            {selected.kind === "deeplink" ? <ExternalLink /> : <Copy />}
            {actionLabel}
          </Button>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </SettingsSection>
  );
}
