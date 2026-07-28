"use client";

import { useTranslations } from "next-intl";
import { Button, Spinner } from "mangue-ui";
import { useAnalytics } from "@/lib/use-analytics";
import { McpConnectPanel } from "@/components/settings/mcp-connect-panel";

/**
 * Étape « connecter un agent » de l'onboarding : le panneau des réglages du
 * compte, tel quel — grille d'agents, puis dialog d'installation — plus la
 * seule chose que l'étape ajoute, sa sortie.
 *
 * Choisir un agent et passer franchissent la même étape : connecter un agent
 * est une proposition, jamais un prérequis. Les deux chemins restent distincts
 * pour l'analytics.
 */
export function OnboardingMcpStep({
  onDone,
  onSkip,
  busy,
}: {
  onDone: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const t = useTranslations("Onboarding");
  const { track } = useAnalytics();

  return (
    <div className="flex w-full flex-col gap-3">
      <McpConnectPanel
        // Quel agent lisent vraiment les comptes qui arrivent — la donnée qui
        // dit pour qui écrire la doc MCP en premier.
        onSelect={(agent) => track("onboarding_mcp_agent_selected", { agent: agent.id })}
        onConnected={onDone}
      />

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSkip}
          disabled={busy}
          className="h-auto bg-transparent px-0 py-0 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground hover:underline"
        >
          {busy && <Spinner />}
          {t("mcpSkipCta")}
        </Button>
      </div>
    </div>
  );
}
