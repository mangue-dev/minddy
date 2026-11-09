"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { fetchOAuthGrantsApi } from "@/lib/oauth-grants-api";
import { oauthGrantsQueryKey } from "@/lib/use-oauth-grants-query";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import {
  AGENT_TARGETS,
  buildAgentDeepLink,
  COPY_LONG_PROMPTS,
  resolvePromptDelivery,
  type AgentTarget,
  type PromptDelivery,
} from "@/lib/prompt-delivery";

/** What became of a prompt: opened in the agent's app, or only copied. */
export type PromptOutcome = { sent: AgentTarget } | { sent: null };

interface PromptDeliveryValue extends PromptDelivery {
  /**
   * Copies `prompt`, then opens it in the account's agent app when it has
   * one. The copy always happens: a browser cannot tell whether the app
   * opened, so the clipboard is what the user falls back on.
   */
  deliver: (prompt: string) => Promise<PromptOutcome>;
}

async function copyOnly(prompt: string): Promise<PromptOutcome> {
  await navigator.clipboard.writeText(prompt);
  return { sent: null };
}

// Outside the provider (public boards, tests): long prompts, copied.
const PromptDeliveryContext = createContext<PromptDeliveryValue>({
  ...COPY_LONG_PROMPTS,
  deliver: copyOnly,
});

const GRANTS_STALE_MS = 5 * 60_000;

function canOpenAgentApp(): boolean {
  const bridge = getDesktopBridge();
  return !bridge || typeof bridge.openAgentApp === "function";
}

/**
 * Resolves once, for the whole app, how the account's prompts are delivered
 * (MIN-951): every card, panel and menu reads the same answer instead of
 * observing the MCP connections itself.
 */
export function PromptDeliveryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const mobile = useMobileLayout();
  const { data } = useQuery({
    queryKey: oauthGrantsQueryKey,
    queryFn: fetchOAuthGrantsApi,
    enabled: !!user,
    staleTime: GRANTS_STALE_MS,
  });
  const agents = useMemo(() => (data?.grants ?? []).map((grant) => grant.agent), [data]);
  const meta = user?.user_metadata;
  const { short, target: wanted } = useMemo(
    // An unresolved viewport counts as mobile: copying is always safe.
    () => resolvePromptDelivery({ meta, agents, mobile: mobile !== false }),
    [meta, agents, mobile],
  );
  // minddy's own desktop shell lets no foreign scheme out of its window: it
  // opens an agent app itself, on request. A shell too old to do so copies.
  const target = wanted && canOpenAgentApp() ? wanted : null;

  const deliver = useCallback(async (prompt: string): Promise<PromptOutcome> => {
    const link = target ? buildAgentDeepLink(target, prompt) : null;
    if (!target || !link) return copyOnly(prompt);
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // The app still opens with the prompt; only the fallback copy is lost.
    }
    const bridge = getDesktopBridge();
    if (bridge) bridge.openAgentApp?.(link);
    else window.location.assign(link);
    return { sent: target };
  }, [target]);

  const value = useMemo(() => ({ short, target, deliver }), [short, target, deliver]);
  return <PromptDeliveryContext.Provider value={value}>{children}</PromptDeliveryContext.Provider>;
}

export function usePromptDelivery(): PromptDeliveryValue {
  return useContext(PromptDeliveryContext);
}

/**
 * Tells the user what became of a prompt. A copied one keeps the message of
 * its surface; one opened in an app names the app, and how many issues or
 * tasks the gesture moved to “In progress”.
 */
export function usePromptAnnouncement() {
  const t = useTranslations("PromptDelivery");
  return useCallback(
    (outcome: PromptOutcome, copied: string, moved = 0) => {
      if (!outcome.sent) {
        toast.success(copied);
        return;
      }
      const agent = AGENT_TARGETS[outcome.sent].label;
      toast.success(moved > 0 ? t("sentMoved", { agent, count: moved }) : t("sent", { agent }));
    },
    [t],
  );
}
