"use client";

import { forwardRef } from "react";
import {
  ChatInput,
  type ChatInputHandle,
  type ChatInputProps,
} from "@/components/assistant/chat-input";
import { useAssistantComposer } from "@/lib/assistant-composer-context";

type AssistantChatInputProps = Omit<
  ChatInputProps,
  "attachmentUploads" | "draftHtml" | "onDraftHtmlChange"
>;

/** The Numo composer bound to the draft and uploads shared by page and FAB. */
export const AssistantChatInput = forwardRef<
  ChatInputHandle,
  AssistantChatInputProps
>(function AssistantChatInput(props, ref) {
  const { draftHtml, setDraftHtml, uploads } = useAssistantComposer();

  return (
    <ChatInput
      {...props}
      ref={ref}
      draftHtml={draftHtml}
      onDraftHtmlChange={setDraftHtml}
      restoreCaretAtEnd
      attachmentUploads={uploads}
    />
  );
});
