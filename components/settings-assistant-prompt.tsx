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

  // `px-0`: the settings are a CARDS column, and the composer must
  // align with their edge. Its 12 px gutter fit it below — we
  // CANCELS it, where the old `-mx-3` compensated for it by making it exceed the
  // column (MIN-167). This gutter only makes sense in the Numo panel,
  // where nothing else pushes the composer off the edge.
  return (
    <section>
      <ChatInput onSend={handleSend} placeholder={placeholder} className="px-0" />
    </section>
  );
}
