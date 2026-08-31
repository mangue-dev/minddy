"use client";

import {
  memo,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { IconButton, cn, toast } from "mangue-ui";
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
import { orbSeedOr } from "@/lib/project-orb-colors";
import { MentionChip } from "@/components/mention-chip";
import { useMentionLinks } from "@/components/mention-links";
import { ResourcePills, type ResourceLike } from "@/components/resources";
import {
  AdaptiveContextRow,
  type AdaptiveContextItem,
} from "@/components/assistant/adaptive-context-row";
import { PAGE_CODE_COMPONENTS } from "@/components/assistant/shared-code-renderer";

interface ChatMessageProps {
  message: AssistantMessage;
  toolCallResults?: Map<
    string,
    { status: "running" | "complete"; result?: unknown; success?: boolean }
  >;
  /**
   * Hides the ask_user line from this message: the ACTIVE question is rendered by the
   * host surface in place of the composer (MIN-86), not like a wire bubble.
   */
  askUserHidden?: boolean;
  /**
   * User response to the ask_user questions in this message (the user bubble
   * which followed, hidden from the thread) — displayed in the line details.
   */
  askUserAnswer?: string | null;
  /**
   * Does this message carry the primer proposal (MIN-173) which is still waiting
   * the user? It is then displayed as a card to check and create.
   */
  seedLive?: boolean;
  /** The tickets for this proposal have just been written (their number). */
  onSeedCreated?: (created: number) => void;
  /** Whether this assistant message renders a Copy button under its text.
   *  Only a turn's final answer should — everything folded into the work
   *  accordion is intermediate narration, not an answer to take away. The host
   *  decides via `copyableMessageIds` (lib/assistant-turns). */
  showCopyButton?: boolean;
  /** Content placed between an assistant answer and its Copy button. */
  afterContent?: ReactNode;
  /** Use the fenced-code component from Pages while preserving Streamdown for
   * the rest of the response. Agent conversations opt into this renderer. */
  usePageCodeBlock?: boolean;
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
      className="size-5 rounded-md bg-transparent p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
      title={tc("copy")}
    >
      {copied ? (
        <Check className="size-3 text-brand" />
      ) : (
        <Copy className="size-3" />
      )}
    </IconButton>
  );
}

// ── Contexte d'un message ─────────────────────────────────────────────

/** What Numo had in mind for THIS message. The project is left
 side: it applies to the entire conversation, repeating it at each bubble
 would not teach anything. */
function MessageContextRow({
  context,
  resources,
}: {
  context?: AssistantPageContext | null;
  resources: ResourceLike[];
}) {
  const t = useTranslations("Assistant");
  const { projects } = useProjects();
  const chips = useMemo(
    () => context
      ? contextChips(context, {
          t,
          project: (id) => projects.find((p) => p.id === id),
        }).filter((chip) => chip.kind !== "project")
      : [],
    [context, t, projects],
  );

  const items: AdaptiveContextItem[] = [
    ...chips.map((chip) => ({
      key: `context:${chip.key}`,
      render: () => <ContextPill chip={chip} />,
    })),
    ...resources.map((resource) => ({
      key: `resource:${resource.id ?? resource.storage_path ?? resource.file_name}`,
      render: () => (
        <ResourcePills
          resources={[resource]}
          className="flex-nowrap"
        />
      ),
    })),
  ];

  if (items.length === 0) return null;
  return (
    <AdaptiveContextRow
      items={items}
      align="end"
      className="w-full max-w-full"
    />
  );
}

// ── Text of a user message ────────────────────────────────────

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type UserMarkdownNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: UserMarkdownNode[];
};

/** Add mention markers after sanitizing, without enabling raw HTML. */
function rehypeUserMentions(mentions: AssistantMention[]) {
  const sorted = mentions
    .map((mention, index) => ({ mention, index }))
    .sort((a, b) => b.mention.label.length - a.mention.label.length);

  const split = (value: string): UserMarkdownNode[] => {
    const pattern = sorted
      .map(({ mention }) => escapeRegExp(mention.label))
      .join("|");
    if (!pattern) return [{ type: "text", value }];

    const re = new RegExp(`@(${pattern})`, "g");
    const out: UserMarkdownNode[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(value)) !== null) {
      if (match.index > last) {
        out.push({ type: "text", value: value.slice(last, match.index) });
      }
      const found = sorted.find(({ mention }) => mention.label === match?.[1]);
      if (!found) {
        out.push({ type: "text", value: match[0] });
      } else {
        out.push({
          type: "element",
          tagName: "span",
          properties: { "data-mention-index": String(found.index) },
          children: [],
        });
      }
      last = match.index + match[0].length;
    }
    if (last < value.length) out.push({ type: "text", value: value.slice(last) });
    return out;
  };

  const walk = (node: UserMarkdownNode) => {
    if (!node.children || node.tagName === "code" || node.tagName === "pre") return;
    const next: UserMarkdownNode[] = [];
    for (const child of node.children) {
      if (child.type === "text" && child.value?.includes("@")) {
        next.push(...split(child.value));
      } else {
        walk(child);
        next.push(child);
      }
    }
    node.children = next;
  };

  return () => (tree: UserMarkdownNode) => walk(tree);
}

/** The bubble text, with the “@” rendered as pills. The mentions are
 persisted on the message metadata (name + id): we therefore do not have to
 guess which member “@Clément” referred to at the time of sending. */
function UserText({
  content,
  mentions,
}: {
  content: string;
  mentions: AssistantMention[];
}) {
  // A mentioned project shows its true face. Its orb takes shape from
  // of its id alone: ​​even a project that has become inaccessible keeps its own, alone
  // the imported favicon asks to know the project.
  const { projects } = useProjects();
  // A SENT message is reread: the pill of a ticket or an objective that we
  // cited leads to him, as in a description. Composing it has no
  // destinations — we write there, a click places the cursor there (chat-input.tsx).
  const links = useMentionLinks();

  return (
    <div className="break-words whitespace-normal [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-background/40 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-background/15 [&_code]:px-1 [&_code]:font-mono [&_h1]:my-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-background/15 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        // No `rehypeRaw`: pasted/source HTML is displayed as text, while the
        // markdown syntax itself is still parsed into headings, lists and code.
        rehypePlugins={[
          [rehypeSanitize, defaultSchema],
          ...(mentions.length > 0 ? [rehypeUserMentions(mentions)] : []),
        ]}
        components={{
          span: ({ node, children }) => {
            const index = Number(
              (node?.properties as Record<string, unknown> | undefined)?.[
                "data-mention-index"
              ],
            );
            const mention = Number.isInteger(index) ? mentions[index] : undefined;
            if (!mention) return <span>{children}</span>;
            return (
              <MentionChip
                type={mention.type}
                id={mention.id}
                label={mention.label}
                avatarSeed={
                  mention.type === "project"
                    ? orbSeedOr(
                        mention.id,
                        projects.find((p) => p.id === mention.id)?.orb_seed,
                      )
                    : mention.avatarSeed
                }
                iconUrl={
                  mention.type === "project"
                    ? projects.find((p) => p.id === mention.id)?.icon_url
                    : null
                }
                icon={mention.icon}
                color={mention.color}
                href={links?.href(mention.type, mention.id) ?? null}
                onNavigate={() => links?.navigate(mention.type, mention.id)}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── Assistant text renderer ───────────────────────────────────────────
// For assistant responses: AI Elements Response (Streamdown).

function AssistantText({
  content,
  usePageCodeBlock = false,
}: {
  content: string;
  usePageCodeBlock?: boolean;
}) {
  return (
    <MessageResponse components={usePageCodeBlock ? PAGE_CODE_COMPONENTS : undefined}>
      {content}
    </MessageResponse>
  );
}

// ── Message components ────────────────────────────────────────────────

/**
 * MEMORIZED, and it's structural: a message already written never changes again.
 *
 * Agent thread re-renders ~4 times per second while model writes
 * (the direct pushes its text at this pace). Without this guard, each of these
 * images re-rendered ALL messages in the thread — therefore re-rendered all their markdown
 * and stirred up all their DOM — to change only one, the last. On a
 * somewhat long session, that's what saturated the main thread.
 *
 * The contract that makes it effective: the owners must keep their identity between
 * two renderings. `message` and `toolCallResults` come from a `useMemo` on the
 * events (stable as long as no event arrives) and `onSeedCreated` /
 * `onOpenFile` must be stable callbacks on the calling side.
 */
export const ChatMessage = memo(function ChatMessage({
  message,
  toolCallResults,
  askUserHidden = false,
  askUserAnswer,
  seedLive = false,
  onSeedCreated,
  showCopyButton = true,
  afterContent,
  usePageCodeBlock = false,
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
            <MessageContextRow
              context={message.context}
              resources={
                Array.isArray(message.metadata?.attachments)
                  ? (message.metadata.attachments as ResourceLike[])
                  : []
              }
            />
            {message.content && (
              <>
                {/* `rounded-xl` and not the `rounded-2xl` of SURFACES (the
 composer, the cards): a bubble is not one, it
 is only a background placed on text. A shorter radius places the
 behind the surface which contains it instead of putting it at its level.

 `mention-on-ink`: the mention pills keep their type hue
 on this bubble, but at the clarity of a ink surface
 — it's the SURFACE that says this, not each pill
 (app/globals.css). */}
                <div className="chat-selectable mention-on-ink relative min-w-0 max-w-full break-words rounded-xl bg-foreground px-4 py-2 text-sm leading-relaxed text-background [overflow-wrap:anywhere]">
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
                <MessageContent
                  className={cn(
                    "chat-selectable relative px-0 py-0 text-sm leading-relaxed text-foreground",
                    usePageCodeBlock && "w-full",
                  )}
                >
                  <AssistantText
                    content={message.content}
                    usePageCodeBlock={usePageCodeBlock}
                  />
                </MessageContent>
                {afterContent ? <div className="w-full">{afterContent}</div> : null}
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
                seedLive={seedLive}
                onSeedCreated={onSeedCreated}
              />
            )}
          </div>
        )}
      </div>
    </Message>
  );
});

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
            // The question during the stream is not displayed in a bubble: from the
            // end of the turn, the LIVING card takes the place of the composer.
            askUserHidden
          />
        )}
      </div>
    </Message>
  );
}
