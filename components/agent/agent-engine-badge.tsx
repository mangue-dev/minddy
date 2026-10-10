"use client";

import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { agentEngineDisplay } from "@/lib/agent-engine-display";
import { isNativeAgentEngine } from "@/lib/agent-engines";

/** The worker harness is distinct from its model and stays fixed for historical runs. */
export function AgentEngineBadge({ engine, className, size = 14 }: {
  engine: unknown;
  className?: string;
  size?: number;
}) {
  const t = useTranslations("Agent");
  const identity = agentEngineDisplay(engine);
  const label = identity.name ?? t("engineLegacyLabel");
  const badge = (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs font-medium", className)}>
      <McpAgentLogo agent={identity.logo} size={size} />
      <span className="truncate">{label}</span>
    </span>
  );
  if (!isNativeAgentEngine(engine)) return badge;
  return <Tooltip><TooltipTrigger asChild>{badge}</TooltipTrigger>
    <TooltipContent>{t("nativeHarnessControls", { agent: label })}</TooltipContent>
  </Tooltip>;
}
