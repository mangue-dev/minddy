import { Bot, Check } from "lucide-react";
import { cn } from "mangue-ui";
import { MinddyLogo } from "@/components/minddy-logo";
import { AgentLogo } from "@/components/settings/agent-logo";
import { getMcpAgent, isMcpAgentId } from "@/lib/mcp-agents";

/**
 * Paire de logos des pages OAuth : minddy ⟷ agent, côte à côte, SANS
 * containers (les marques respirent). Entre les deux : trois points en
 * connexion, remplacés par une coche sur l'état "success".
 */
export function OAuthLogoPair({
  agentId,
  state = "connect",
  className,
}: {
  /** Agent du registry deviné depuis le client_name ; null = client inconnu. */
  agentId: string | null;
  state?: "connect" | "success";
  className?: string;
}) {
  const agent = isMcpAgentId(agentId) ? getMcpAgent(agentId) : null;

  return (
    <div className={cn("flex items-center justify-center gap-5", className)}>
      <MinddyLogo className="h-11 w-11 shrink-0 text-foreground" />

      {state === "success" ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-500">
          <Check className="size-4" strokeWidth={3} />
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
          <span className="size-1 rounded-full bg-muted-foreground/40" />
          <span className="size-1.5 rounded-full bg-muted-foreground/60" />
          <span className="size-1 rounded-full bg-muted-foreground/40" />
        </span>
      )}

      {agent ? (
        <AgentLogo agent={agent} className="size-11 shrink-0" />
      ) : (
        <Bot className="size-11 shrink-0 text-muted-foreground" />
      )}
    </div>
  );
}
