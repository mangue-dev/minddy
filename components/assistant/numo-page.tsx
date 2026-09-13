"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AppContentHeader } from "@/components/app-content-header";
import { AssistantShell } from "@/components/assistant/assistant-shell";
import { useAssistantChatContext } from "@/lib/assistant-chat-context";
import { updateConversation } from "@/lib/assistant-api";
import {
  useAssistantPanel,
  useSuppressAssistantFab,
} from "@/lib/assistant-panel-context";

/** The full-page projection of the same Numo conversation used by the FAB. */
export function NumoPage() {
  useSuppressAssistantFab();
  const searchParams = useSearchParams();
  const { scopeProjectId, state, loadConversation, reset } = useAssistantChatContext();
  const { isOpen, close } = useAssistantPanel();
  const consumedLinkedConversationId = useRef<string | null>(null);

  // Navigating from the FAB to the full page hands the projection over instead
  // of leaving a second composer layered above the same controller.
  useEffect(() => {
    if (isOpen) close();
  }, [close, isOpen]);

  const linkedConversationId = searchParams.get("conversation");
  useEffect(() => {
    if (!linkedConversationId && state.routineOccurrence) reset();
  }, [linkedConversationId, reset, state.routineOccurrence]);

  useEffect(() => {
    if (!linkedConversationId) {
      consumedLinkedConversationId.current = null;
      return;
    }
    if (consumedLinkedConversationId.current === linkedConversationId) return;
    consumedLinkedConversationId.current = linkedConversationId;
    void updateConversation(linkedConversationId, { read: true }).catch(() => {});
    if (state.conversationId === linkedConversationId) return;
    void loadConversation(linkedConversationId, null);
  }, [linkedConversationId, loadConversation, state.conversationId]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <AppContentHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        <AssistantShell projectId={scopeProjectId} />
      </div>
    </div>
  );
}
