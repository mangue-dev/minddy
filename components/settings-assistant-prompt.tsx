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

  // `px-0` : les réglages sont une colonne de CARTES, et le composeur doit
  // s'aligner sur leur bord. Sa gouttière de 12 px le rentrait en deçà — on
  // l'ANNULE, là où l'ancien `-mx-3` la compensait en le faisant dépasser de la
  // colonne (MIN-167). Cette gouttière n'a de sens que dans le panneau de Numo,
  // où rien d'autre n'écarte le composeur du bord.
  return (
    <section>
      <ChatInput onSend={handleSend} placeholder={placeholder} className="px-0" />
    </section>
  );
}
