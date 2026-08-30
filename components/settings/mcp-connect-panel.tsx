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
import { McpAgentLogo } from "@/components/mcp-agent-logo";

/** “Connect an agent” — OAuth only: The install command does not contain ANY secrets (the agent opens the browser to allow first use). 100% client-side copy, nothing to generate.

 ONE question at a time: the grid asks which agent, the dialog gives its
 command. Everything was previously in the same frame - selector, command,
 button and explanation stacked together - and nothing was read there anymore.

 The same component serves the account settings (`account-mcp-section.tsx`) and
 the MCP onboarding step (`components/home/onboarding-mcp-step.tsx`), which only
 adds its “Skip this step” action. */
export function McpConnectPanel({
  className,
  onSelect,
  onConnected,
}: {
  className?: string;
  /** The agent has just been chosen — onboarding uses it for analytics. */
  onSelect?: (agent: McpAgent) => void;
  /** The dialog closed with "It's connected". */
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
            <McpAgentLogo agent={item.id} className="size-4" />
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

/** The artifact of an agent and the gesture that goes with it: a command to paste, a
 config block, the server URL, or a one-click installation link. */
function McpAgentInstall({ agent }: { agent: McpAgent }) {
  const t = useTranslations("Account");

  // window only exists on the client; rendered after mount to avoid any mismatch.
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
      {/* `w-full min-w-0`: without them, `whitespace-pre` imposes on the block its
 min-content width — that of the entire command, on one line —
 and the dialog is expanded by its own content instead of letting it scroll. */}
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
