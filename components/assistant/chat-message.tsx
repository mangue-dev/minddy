"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";
import { IconButton, toast } from "mangue-ui";
import type { AssistantMessage } from "@/lib/assistant-types";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { ToolCallList } from "./tool-call-display";
import { PageContextBadge } from "./page-context-badge";
import { AttachmentPills, type AttachmentLike } from "@/components/attachments";

interface ChatMessageProps {
  message: AssistantMessage;
  toolCallResults?: Map<
    string,
    { status: "running" | "complete"; result?: unknown; success?: boolean }
  >;
  /**
   * Masque la ligne ask_user de ce message : la question ACTIVE est rendue par la
   * surface hôte à la place du composer (MIN-86), pas comme une bulle du fil.
   */
  askUserHidden?: boolean;
  /**
   * Réponse de l'utilisateur aux questions ask_user de ce message (la bulle user
   * qui suivait, masquée du fil) — affichée dans les détails de la ligne.
   */
  askUserAnswer?: string | null;
  /** Whether this assistant message renders a Copy button under its text.
   *  Only the last assistant message of a turn should — mid-turn segments
   *  (text that precedes a tool call / a later assistant reply) read as one
   *  continuous answer, so they stay button-less and tighter. */
  showCopyButton?: boolean;
  /** Ce message est-il la tête vivante de la conversation (aucun message plus
   *  récent, agent au travail) ? → son accordéon de tool-calls fermé shimmer. */
  isLatestMessage?: boolean;
}

// True for messages that ChatMessage renders nothing for, so they don't break
// the "is this the last assistant message of the turn?" lookahead.
function isHiddenMessage(m: AssistantMessage): boolean {
  return m.role === "tool" || m.role === "system";
}

/**
 * Ids of assistant messages that should show a Copy button: the LAST assistant
 * message before the next visible user message (or end of conversation). A
 * multi-segment answer (text → tool call → text) thus shows a single Copy
 * button under its final segment, not one per segment.
 */
export function assistantCopyMessageIds(
  messages: AssistantMessage[],
): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.content) continue;
    let isLastOfTurn = true;
    for (let j = i + 1; j < messages.length; j++) {
      if (isHiddenMessage(messages[j])) continue;
      // The next visible message decides: another assistant → mid-turn.
      isLastOfTurn = messages[j].role !== "assistant";
      break;
    }
    if (isLastOfTurn) ids.add(m.id);
  }
  return ids;
}

// ── Copy button ───────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const tc = useTranslations("Common");
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    toast(tc("copied"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text, tc]);

  return (
    <IconButton
      type="button"
      onClick={handleCopy}
      variant="ghost"
      size="sm"
      aria-label={tc("copy")}
      className="size-6 rounded-md bg-transparent p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
      title={tc("copy")}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-brand" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </IconButton>
  );
}

// ── Assistant text renderer ───────────────────────────────────────────
// For assistant responses: AI Elements Response (Streamdown).

function AssistantText({ content }: { content: string }) {
  return <MessageResponse>{content}</MessageResponse>;
}

// ── Message components ────────────────────────────────────────────────

export function ChatMessage({
  message,
  toolCallResults,
  askUserHidden = false,
  askUserAnswer,
  showCopyButton = true,
  isLatestMessage = false,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  if (message.role === "tool" || message.role === "system") return null;

  return (
    <Message
      from={isUser ? "user" : "assistant"}
      className="group max-w-full gap-2"
    >
      <div className="flex w-full flex-col">
        {isUser ? (
          <div className="ml-auto flex max-w-[85%] flex-col items-end gap-1">
            {message.context &&
              (message.context.issueId || message.context.objectiveId) && (
                <PageContextBadge context={message.context} />
              )}
            {Array.isArray(message.metadata?.attachments) &&
              message.metadata.attachments.length > 0 && (
                <AttachmentPills
                  variant="ultra-compact"
                  attachments={message.metadata.attachments as AttachmentLike[]}
                  className="justify-end"
                />
              )}
            {message.content && (
              <>
                <div className="chat-selectable relative rounded-2xl bg-foreground px-4 py-2 text-sm leading-relaxed text-background">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                <div className="-mt-0.5">
                  <CopyButton text={message.content} />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            {message.content && (
              <>
                <MessageContent className="chat-selectable relative px-0 py-0 text-sm leading-relaxed text-foreground">
                  <AssistantText content={message.content} />
                </MessageContent>
                {showCopyButton && (
                  <div className="-mt-1">
                    <CopyButton text={message.content} />
                  </div>
                )}
              </>
            )}

            {message.tool_calls && message.tool_calls.length > 0 && (
              <ToolCallList
                items={message.tool_calls.map((tc) => {
                  const status = toolCallResults?.get(tc.id);
                  return {
                    id: tc.id,
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                    status: status?.status || "running",
                    result: status?.result,
                    success: status?.success ?? true,
                  };
                })}
                askUserHidden={askUserHidden}
                askUserAnswer={askUserAnswer}
                isLatest={isLatestMessage}
              />
            )}
          </div>
        )}
      </div>
    </Message>
  );
}

// Streaming message (not yet persisted)
export function StreamingMessage({
  content,
  activeToolCalls,
}: {
  content: string;
  activeToolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
    status: "running" | "complete";
    result?: unknown;
    success?: boolean;
  }>;
}) {
  const hasContent = content.length > 0;
  const hasToolCalls = activeToolCalls.length > 0;

  if (!hasContent && !hasToolCalls) return null;

  return (
    <Message from="assistant" className="group max-w-full gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {hasContent && (
          <MessageContent className="px-0 py-0 text-sm leading-relaxed text-foreground">
            <AssistantText content={content} />
          </MessageContent>
        )}
        {hasToolCalls && (
          <ToolCallList
            items={activeToolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
              status: tc.status,
              result: tc.result,
              success: tc.success,
            }))}
            // La question en cours de stream ne s'affiche pas en bulle : dès la
            // fin du tour, la carte VIVANTE prend la place du composer.
            askUserHidden
          />
        )}
      </div>
    </Message>
  );
}
