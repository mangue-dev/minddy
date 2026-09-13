"use client";

import { useEffect } from "react";
import { AssistantShell } from "@/components/assistant/assistant-shell";
import { useAssistantChatContext } from "@/lib/assistant-chat-context";
import {
  useAssistantPanel,
  useSuppressAssistantFab,
} from "@/lib/assistant-panel-context";

/** The full-page projection of the same Numo conversation used by the FAB. */
export function NumoPage() {
  useSuppressAssistantFab();
  const { scopeProjectId } = useAssistantChatContext();
  const { isOpen, close } = useAssistantPanel();

  // Navigating from the FAB to the full page hands the projection over instead
  // of leaving a second composer layered above the same controller.
  useEffect(() => {
    if (isOpen) close();
  }, [close, isOpen]);

  return (
    <div className="h-full min-h-0 flex-1 overflow-hidden">
      <AssistantShell projectId={scopeProjectId} />
    </div>
  );
}
