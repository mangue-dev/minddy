"use client";

import { useTranslations } from "next-intl";
import { ChatInput } from "@/components/assistant/chat-input";
import { useAssistantPanel } from "@/lib/assistant-panel-context";

/**
 * Compact "Ask Numo" composer for the home dashboard (MIN-38) — mirrors
 * AutoKap's `home-quick-actions`: it never talks to the chat API itself, it
 * hands the prompt to the global assistant panel (`projectId: null` → global
 * scope), which opens and auto-sends. Attachments are hidden (`open({prompt})`
 * carries no files — they belong inside the panel).
 *
 * The `-mx-3` cancels {@link ChatInput}'s own `px-3` gutter so the composer
 * surface aligns flush with the dashboard's content column.
 */
export function HomeNumoComposer() {
  const t = useTranslations("Home");
  const { open } = useAssistantPanel();

  return (
    <div className="-mx-3">
      <ChatInput
        hideAttach
        placeholder={t("numoPlaceholder")}
        onSend={(message) => open({ projectId: null, prompt: message })}
      />
    </div>
  );
}
