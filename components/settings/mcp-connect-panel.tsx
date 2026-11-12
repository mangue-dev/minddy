"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, CheckmarkCircle02Icon, Copy01Icon, McpServerIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { WizardDialog, type WizardStep } from "@/components/wizard/wizard-dialog";
import { MCP_AGENTS, type McpAgent } from "@/lib/mcp-agents";
import { useOAuthGrantsQuery } from "@/lib/use-oauth-grants-query";
import { McpAgentLogo } from "@/components/mcp-agent-logo";

type StepId = "install" | "authorize";

/**
 * Select an agent, then walk through its connection in a wizard: install
 * minddy in the agent, then approve the agent's sign-in. The second step
 * watches the account's OAuth grants and says when the agent arrived.
 */
export function McpConnectPanel({
  className,
  layout = "list",
  onSelect,
  onConnected,
}: {
  className?: string;
  /**
   * `cards`: square cards in two columns, logo in the middle and name under
   * it, for the phone's getting-started sheet. `list`: compact rows, for the
   * settings page.
   */
  layout?: "list" | "cards";
  /** Called when an agent is selected. */
  onSelect?: (agent: McpAgent) => void;
  /** The wizard finished. */
  onConnected?: () => void;
}) {
  const t = useTranslations("Account");
  const [agent, setAgent] = useState<McpAgent | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const cards = layout === "cards";

  const select = (next: McpAgent) => {
    onSelect?.(next);
    setAgent(next);
    setStepIndex(0);
  };

  // Any other MCP client: no setup of its own to show, only a prompt that
  // names the server and how it signs in.
  const copyGenericPrompt = async () => {
    await navigator.clipboard.writeText(t("agentPromptGeneric", { url: `${window.location.origin}/api/mcp` }));
    toast.success(t("agentPromptGenericCopied"));
  };

  const itemClass = cards
    ? "flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-background p-3 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:bg-brand/8 focus-visible:border-ring focus-visible:outline-none"
    : "flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:bg-brand/8 focus-visible:border-ring focus-visible:outline-none";
  const logoClass = cards ? "size-9" : "size-4";

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div
        className={cn("grid grid-cols-2 gap-2", !cards && "sm:grid-cols-3")}
        role="group"
        aria-label={t("mcpAgentPicker")}
      >
        {MCP_AGENTS.map((item) => (
          <button key={item.id} type="button" onClick={() => select(item)} className={itemClass}>
            <McpAgentLogo agent={item.id} size={cards ? 36 : 16} className={logoClass} />
            <span className={cn("min-w-0 truncate", cards && "max-w-full text-center")}>{item.label}</span>
          </button>
        ))}
        <button type="button" onClick={() => void copyGenericPrompt()} className={itemClass}>
          <HugeiconsIcon icon={McpServerIcon} className={cn(logoClass, "text-muted-foreground")} aria-hidden />
          <span className={cn("min-w-0 truncate", cards && "max-w-full text-center")}>{t("mcpOtherAgent")}</span>
        </button>
      </div>

      {agent && (
        <McpAgentWizard
          agent={agent}
          stepIndex={stepIndex}
          onStepIndexChange={setStepIndex}
          onClose={() => setAgent(null)}
          onConnected={() => {
            setAgent(null);
            onConnected?.();
          }}
        />
      )}
    </div>
  );
}

function McpAgentWizard({
  agent,
  stepIndex,
  onStepIndexChange,
  onClose,
  onConnected,
}: {
  agent: McpAgent;
  stepIndex: number;
  onStepIndexChange: (index: number) => void;
  onClose: () => void;
  onConnected: () => void;
}) {
  const t = useTranslations("Account");
  const waiting = stepIndex === 1;
  // Polled only on the waiting step: the consent happens in a browser page
  // the agent opens, and nothing tells this tab when it completes.
  const { grants } = useOAuthGrantsQuery({ refetchInterval: waiting ? 3000 : false });
  const connected = grants.some((grant) => grant.agent === agent.id);

  const steps: WizardStep<StepId>[] = [
    {
      id: "install",
      title: t("mcpInstallTitle", { name: agent.label }),
      subtitle: t("mcpInstallPromptHint", { name: agent.label }),
      content: <McpAgentInstall agent={agent} />,
    },
    {
      id: "authorize",
      title: connected
        ? t("mcpConnectedTitle", { name: agent.label })
        : t("mcpAuthorizeTitle"),
      subtitle: connected
        ? t("mcpConnectedDesc", { name: agent.label })
        : t("mcpDialogDesc", { name: agent.label }),
      // "It's connected" only once a grant proves it; before that, closing
      // is just leaving the sign-in for later.
      submitLabel: connected ? t("mcpDialogDone") : t("mcpWizardDone"),
      content: connected ? (
        <p className="flex items-center gap-2 text-sm" role="status">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            className="size-5 shrink-0 text-success"
            aria-hidden
          />
          {t("mcpConnectedStatus", { name: agent.label })}
        </p>
      ) : (
        <p className="text-shimmer text-sm text-muted-foreground" role="status">
          {t("mcpWaitingStatus", { name: agent.label })}
        </p>
      ),
    },
  ];

  return (
    <WizardDialog
      open
      onOpenChange={(open) => !open && onClose()}
      label={t("mcpDialogTitle", { name: agent.label })}
      steps={steps}
      stepIndex={stepIndex}
      onStepIndexChange={onStepIndexChange}
      onSubmit={(step) => {
        if (step === "install") onStepIndexChange(1);
        else onConnected();
      }}
    />
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

  const setup = agent.build(endpoint);

  // The quickest way: the agent installs minddy itself from a prompt that
  // carries the same setup as the manual instructions below.
  const copyPrompt = async () => {
    await navigator.clipboard.writeText(t("agentPrompt", { name: agent.label, setup }));
    toast.success(t("agentPromptCopied", { name: agent.label }));
  };

  const act = async () => {
    await navigator.clipboard.writeText(setup);
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
    <div className="flex min-w-0 flex-col gap-3">
      <Button type="button" className="h-11 w-full rounded-full" onClick={() => void copyPrompt()}>
        <HugeiconsIcon icon={Copy01Icon} />
        {t("copyAgentPrompt")}
      </Button>
      <Collapsible className="min-w-0">
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-lg py-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          {t("manualSetup")}
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex min-w-0 flex-col gap-3 pt-1">
          <p className="text-sm text-muted-foreground">{t(agent.hint)}</p>
          {/* `w-full min-w-0`: without them, `whitespace-pre` imposes on the
              block its min-content width, that of the whole command on one
              line, and the dialog grows instead of letting it scroll. */}
          <code className="max-h-48 w-full min-w-0 overflow-auto whitespace-pre rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-mono text-xs">
            {setup}
          </code>
          <Button type="button" variant="outline" className="self-start" onClick={() => void act()}>
            <HugeiconsIcon icon={Copy01Icon} />
            {actionLabel}
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
