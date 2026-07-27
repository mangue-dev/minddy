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
   *  Only a turn's final answer should — everything folded into the work
   *  accordion is intermediate narration, not an answer to take away. The host
   *  decides via `copyableMessageIds` (lib/assistant-turns). */
  showCopyButton?: boolean;
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
