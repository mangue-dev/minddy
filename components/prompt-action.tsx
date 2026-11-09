"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon } from "@hugeicons/core-free-icons";
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { cn } from "@/lib/utils";
import { AGENT_TARGETS } from "@/lib/prompt-delivery";
import { usePromptDelivery } from "@/lib/prompt-delivery-context";

/**
 * The label of a prompt action: its own "Copy …" wording, or "Send to
 * <agent>" when the account opens prompts in an agent's app (MIN-951).
 */
export function usePromptActionLabel(): (copyLabel: string) => string {
  const { target } = usePromptDelivery();
  const t = useTranslations("PromptDelivery");
  return useCallback(
    (copyLabel: string) =>
      target ? t("sendTo", { agent: AGENT_TARGETS[target].label }) : copyLabel,
    [target, t],
  );
}

/** The icon beside it: the agent's logo, or the copy glyph. */
export function PromptActionIcon({ className }: { className?: string }) {
  const { target } = usePromptDelivery();
  return target ? (
    <McpAgentLogo agent={AGENT_TARGETS[target].logo} className={cn("size-4", className)} />
  ) : (
    <HugeiconsIcon icon={Copy01Icon} className={cn("size-4", className)} />
  );
}
