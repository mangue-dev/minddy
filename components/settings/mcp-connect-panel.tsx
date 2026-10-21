"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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
  onSelect,
  onConnected,
}: {
  className?: string;
  /** Called when an agent is selected. */
  onSelect?: (agent: McpAgent) => void;
  /** The wizard finished. */
  onConnected?: () => void;
}) {
  const t = useTranslations("Account");
  const [agent, setAgent] = useState<McpAgent | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const select = (next: McpAgent) => {
    onSelect?.(next);
    setAgent(next);
    setStepIndex(0);
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
      subtitle: t(agent.hint),
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
            className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          {t("mcpConnectedStatus", { name: agent.label })}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner />
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
    <div className="flex min-w-0 flex-col gap-3">
      {/* `w-full min-w-0`: without them, `whitespace-pre` imposes on the block its
 min-content width — that of the entire command, on one line —
 and the dialog is expanded by its own content instead of letting it scroll. */}
      <code className="max-h-48 w-full min-w-0 overflow-auto whitespace-pre rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-mono text-xs">
        {agent.build(endpoint)}
      </code>
      <Button type="button" variant="outline" className="self-start" onClick={() => void act()}>
        <HugeiconsIcon icon={Copy01Icon} />
        {actionLabel}
      </Button>
    </div>
  );
}
