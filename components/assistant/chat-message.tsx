"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";
import { IconButton, toast } from "mangue-ui";
import type {
  AssistantMention,
  AssistantMessage,
  AssistantPageContext,
} from "@/lib/assistant-types";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { ToolCallList } from "./tool-call-display";
import { ContextPill } from "./context-pill";
import { contextChips } from "@/lib/assistant-context";
import { useProjects } from "@/lib/projects-context";
import { MentionChip } from "@/components/mention-chip";
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

// ── Contexte d'un message ─────────────────────────────────────────────

/** Ce que Numo avait sous les yeux pour CE message. Le projet est laissé de
    côté : il vaut pour toute la conversation, le répéter à chaque bulle
    n'apprendrait rien. */
function MessageContextChips({ context }: { context: AssistantPageContext }) {
  const t = useTranslations("Assistant");
  const { projects } = useProjects();
  const chips = useMemo(
    () =>
      contextChips(context, {
        t,
        project: (id) => projects.find((p) => p.id === id),
      }).filter((chip) => chip.kind !== "project"),
    [context, t, projects],
  );

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {chips.map((chip) => (
        <ContextPill key={chip.key} chip={chip} />
      ))}
    </div>
  );
}

// ── Texte d'un message utilisateur ────────────────────────────────────

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Le texte de la bulle, avec les « @ » rendus en pilules. Les mentions sont
    persistées sur la métadonnée du message (nom + id) : on n'a donc pas à
    deviner à quel membre « @Clément » renvoyait au moment de l'envoi. */
function UserText({
  content,
  mentions,
}: {
  content: string;
  mentions: AssistantMention[];
}) {
  // Un projet mentionné montre sa vraie figure. Son orbe se dessine à partir
  // de son id seul : même un projet devenu inaccessible garde la sienne, seul
  // le favicon importé demande de connaître le projet.
  const { projects } = useProjects();
  const parts = useMemo(() => {
    if (mentions.length === 0) return [content];
    // Le plus long d'abord : « @Marie Curie » avant « @Marie ».
    const sorted = [...mentions].sort((a, b) => b.label.length - a.label.length);
    const re = new RegExp(
      `@(${sorted.map((m) => escapeRegExp(m.label)).join("|")})`,
      "g",
    );
    const out: Array<string | AssistantMention> = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      if (match.index > last) out.push(content.slice(last, match.index));
      const mention = sorted.find((m) => m.label === match?.[1]);
      out.push(mention ?? match[0]);
      last = match.index + match[0].length;
    }
    if (last < content.length) out.push(content.slice(last));
    return out;
  }, [content, mentions]);

  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, i) =>
        typeof part === "string" ? (
          part
        ) : (
          <MentionChip
            key={`${part.type}:${part.id}:${i}`}
            type={part.type}
            id={part.id}
            label={part.label}
            avatarSeed={part.avatarSeed}
            iconUrl={
              part.type === "project"
                ? projects.find((p) => p.id === part.id)?.icon_url
                : null
            }
            // Sur la bulle sombre, la teinte de marque ne passe pas : la pilule
            // s'éclaircit dans la couleur du texte qui l'entoure.
            className="bg-background/15 text-background"
          />
        ),
      )}
    </p>
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
            {message.context && <MessageContextChips context={message.context} />}
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
                  <UserText
                    content={message.content}
                    mentions={
                      Array.isArray(message.metadata?.mentions)
                        ? (message.metadata.mentions as AssistantMention[])
                        : []
                    }
                  />
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
