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

  // ChatInput insets its card by its own `px-3`; pull the section out by the
  // same amount so the card aligns flush with the rest of the page content.
  return (
    <section className="-mx-3">
      <ChatInput onSend={handleSend} placeholder={placeholder} />
    </section>
  );
}
