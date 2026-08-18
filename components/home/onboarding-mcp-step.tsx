"use client";

import { useTranslations } from "next-intl";
import { Button, Spinner } from "mangue-ui";
import { useAnalytics } from "@/lib/use-analytics";
import { McpConnectPanel } from "@/components/settings/mcp-connect-panel";

/**
 * “Connect an agent” step of onboarding: the settings panel of the
 * account, as is — agent grid, then installation dialog — plus the
 * only thing the stage adds, its output.
 *
 * Choosing an agent and going through the same step: connecting an agent
 * is a proposition, never a prerequisite. The two paths remain distinct
 * for analytics.
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
        // Which agent really reads the accounts that come in — the data that
        // says for whom to write the MCP doc first.
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
