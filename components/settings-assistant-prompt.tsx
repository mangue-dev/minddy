"use client";

import { useCallback } from "react";
import { ChatInput } from "@/components/assistant/chat-input";
import { useAssistantPanel } from "@/lib/assistant-panel-context";

interface SettingsAssistantPromptProps {
  /** `null` opens the assistant in global (account) scope. */
  projectId: string | null;
  placeholder: string;
}

/**
 * Top-of-page composer that makes it explicit settings can be changed by asking
 * Numo. Submitting opens the assistant panel with the message pre-sent in the
 * right scope (project settings → that project; account settings → global).
 * Mirrors AutoKap's SettingsAssistantPrompt.
 */
export function SettingsAssistantPrompt({
  projectId,
  placeholder,
}: SettingsAssistantPromptProps) {
  const openAssistant = useAssistantPanel().open;

  const handleSend = useCallback(
    (message: string) => {
      openAssistant({ projectId, prompt: message });
    },
    [openAssistant, projectId],
  );

  // Aucun décalage : les réglages sont désormais une colonne de CARTES, et le
  // composeur doit s'aligner sur leur bord. L'ancien `-mx-3`, qui compensait
  // l'inset de `ChatInput`, le faisait dépasser de la colonne (MIN-167).
  return (
    <section>
      <ChatInput onSend={handleSend} placeholder={placeholder} />
    </section>
  );
}
