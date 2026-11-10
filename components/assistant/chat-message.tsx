"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, CheckIcon } from "@hugeicons/core-free-icons";
import {
  memo,
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { IconButton } from "@/components/ui/icon-button";
import { toast } from "sonner";
import type {
  AssistantMention,
  AssistantMessage,
  AssistantPageContext,
  AssistantSkillSelection,
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
import { MarkdownLink } from "@/components/markdown-link";
import { mentionStatus, useMentionLinks } from "@/components/mention-links";
import { ResourcePills, type ResourceLike } from "@/components/resources";
import {
  AdaptiveContextRow,
  type AdaptiveContextItem,
} from "@/components/assistant/adaptive-context-row";
import { PAGE_CODE_COMPONENTS } from "@/components/assistant/shared-code-renderer";
import { TypedMentionChip } from "@/components/typed-mention-chip";
import { keepMentionUrls, SANITIZE_SCHEMA } from "@/components/markdown";
import { parseMentionHref } from "@/lib/mention-link";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { messageTimeLabel } from "@/lib/message-time";
import { cn } from "@/lib/utils";
import {
  NumoUsageExhaustedCard,
  parseNumoUsageExhausted,
} from "@/components/assistant/usage-exhausted-card";
import { SkillChip } from "@/components/assistant/skill-chip";

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
  /** Keeps the Copy button visible without hovering: the host sets it on
   *  Numo's latest answer, the one most often copied. */
  pinCopyButton?: boolean;
  /** Content placed between an assistant answer and its Copy button. */
  afterContent?: ReactNode;
  /** The host draws this message's reminder approval cards under the turn's
   *  answer, so its tool calls leave them out. */
  watchProposalsOutside?: boolean;
}

// ── Copy button and sent time ─────────────────────────────────────

function CopyButton({ text, pinned }: { text: string; pinned: boolean }) {
  const tc = useTranslations("Common");
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    toast(tc("copied"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text, tc]);

  return (
    <AppTooltip label={tc("copy")}>
      <IconButton
        type="button"
        onClick={handleCopy}
        variant="ghost"
        size="sm"
        aria-label={tc("copy")}
        className={cn(
          "size-7 rounded-md bg-transparent p-1.5 text-muted-foreground transition-[opacity,color] hover:bg-accent hover:text-foreground",
          pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100 touch:opacity-100",
        )}
      >
        {copied ? (
          <HugeiconsIcon icon={CheckIcon} className="size-4 text-brand" />
        ) : (
          <HugeiconsIcon icon={Copy01Icon} className="size-4" />
        )}
      </IconButton>
    </AppTooltip>
  );
}

/** When the message was sent, shown on hover only, in the Copy button's
 *  color. The shortest label that stays unambiguous (lib/message-time). */
function SentTime({ sentAt }: { sentAt: string }) {
  const locale = useLocale();
  const label = messageTimeLabel(sentAt, locale);
  if (!label) return null;
  return (
    <time
      dateTime={sentAt}
      className="text-xs tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 touch:opacity-100"
    >
      {label}
    </time>
  );
}

/** The row under a bubble: Copy, with the time on the side away from the
 *  bubble's edge (after it for Numo, before it for the user). */
function MessageActions({
  text,
  sentAt,
  side,
  pinned = false,
}: {
  text: string;
  sentAt: string;
  side: "start" | "end";
  pinned?: boolean;
}) {
  return (
    // Under Numo's answer the row starts at the text's edge: the button's own
    // padding is pulled back so its icon lines up with the first letter. The
    // user's bubble is right-aligned and keeps it.
    <div className={cn("flex items-center gap-1.5", side === "end" ? "flex-row-reverse" : "-ml-1.5")}>
      <CopyButton text={text} pinned={pinned} />
      <SentTime sentAt={sentAt} />
    </div>
  );
}

// ── Contexte d'un message ─────────────────────────────────────────────

/** What Numo had in mind for THIS message, its project included: Numo
 receives it with the message, so the row says so too. */
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
        })
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
          // One line shared with the context chips: the compact form.
          variant="pill"
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

/** Replace only skills persisted on this message; arbitrary slash text stays text. */
function rehypeUserSkills(skills: AssistantSkillSelection[]) {
  const sorted = skills
    .map((skill, index) => ({ skill, index }))
    .sort((a, b) => b.skill.name.length - a.skill.name.length);

  const split = (value: string): UserMarkdownNode[] => {
    const pattern = sorted.map(({ skill }) => escapeRegExp(skill.name)).join("|");
    if (!pattern) return [{ type: "text", value }];
    const re = new RegExp(`(^|\\s)/(${pattern})(?=\\s|$)`, "g");
    const out: UserMarkdownNode[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(value)) !== null) {
      if (match.index > last) {
        out.push({ type: "text", value: value.slice(last, match.index) });
      }
      if (match[1]) out.push({ type: "text", value: match[1] });
      const found = sorted.find(({ skill }) => skill.name === match?.[2]);
      out.push(
        found
          ? {
              type: "element",
              tagName: "span",
              properties: { "data-skill-index": String(found.index) },
              children: [],
            }
          : { type: "text", value: match[0] },
      );
      last = match.index + match[0].length;
    }
    if (last < value.length) out.push({ type: "text", value: value.slice(last) });
    return out;
  };

  const walk = (node: UserMarkdownNode) => {
    if (!node.children || node.tagName === "code" || node.tagName === "pre") return;
    const next: UserMarkdownNode[] = [];
    for (const child of node.children) {
      if (child.type === "text" && child.value?.includes("/")) {
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
  skills,
}: {
  content: string;
  mentions: AssistantMention[];
  skills: AssistantSkillSelection[];
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
        // A message sent since MIN-872 carries typed mention links: they
        // survive the URL rules and the sanitizer, and render as live pills.
        urlTransform={keepMentionUrls}
        rehypePlugins={[
          [rehypeSanitize, SANITIZE_SCHEMA],
          ...(mentions.length > 0 ? [rehypeUserMentions(mentions)] : []),
          ...(skills.length > 0 ? [rehypeUserSkills(skills)] : []),
        ]}
        components={{
          a: (props) => {
            const target = parseMentionHref(typeof props.href === "string" ? props.href : null);
            return target
              ? <TypedMentionChip type={target.type} id={target.id} meta={target.meta} />
              : <MarkdownLink {...props} />;
          },
          span: ({ node, children }) => {
            const index = Number(
              (node?.properties as Record<string, unknown> | undefined)?.[
                "data-mention-index"
              ],
            );
            const mention = Number.isInteger(index) ? mentions[index] : undefined;
            if (!mention) {
              const skillIndex = Number(
                (node?.properties as Record<string, unknown> | undefined)?.[
                  "data-skill-index"
                ],
              );
              const skill = Number.isInteger(skillIndex) ? skills[skillIndex] : undefined;
              return skill ? <SkillChip name={skill.name} /> : <span>{children}</span>;
            }
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
                status={
                  mentionStatus(links, mention.type, mention.id) ??
                  (mention.type === "issue" || mention.type === "objective"
                    ? mention.status
                    : undefined)
                }
                tooltip={mention.type === "issue" ? links?.issueTitle?.(mention.id) ?? null : null}
                hoverCard={{ project: links?.projectId ?? null }}
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

// Numo cites what it can with typed mentions (`[@Label](mention:type/id)`).
// Streamdown's sanitizer drops an unknown URL scheme, so each mention travels
// as an in-page address and its link renders as the pill an editor shows.
const ASSISTANT_MENTION_PREFIX = "#mention:";
const ASSISTANT_MENTION_LINK =
  /(\[@(?:[^\]\\\n]|\\.){0,256}\])\(mention:([a-z_]{1,16}\/[A-Za-z0-9_.-]{1,64}(?:\?[A-Za-z0-9_.:=&-]{1,300})?)\)/g;

function AssistantLink(props: ComponentProps<typeof MarkdownLink>) {
  const href = typeof props.href === "string" ? props.href : null;
  const target = href?.startsWith(ASSISTANT_MENTION_PREFIX)
    ? parseMentionHref(href.slice(1))
    : null;
  if (target) return <TypedMentionChip type={target.type} id={target.id} meta={target.meta} />;
  return <MarkdownLink {...props} />;
}

const ASSISTANT_COMPONENTS = { ...PAGE_CODE_COMPONENTS, a: AssistantLink };

// Fenced code uses the app's code block, the one Pages and the notebook show;
// Streamdown keeps the rest of the response.
function AssistantText({ content }: { content: string }) {
  const rendered = useMemo(
    () => content.includes("](mention:")
      ? content.replace(ASSISTANT_MENTION_LINK, `$1(${ASSISTANT_MENTION_PREFIX}$2)`)
      : content,
    [content],
  );
  return (
    <MessageResponse components={ASSISTANT_COMPONENTS}>
      {rendered}
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
  pinCopyButton = false,
  afterContent,
  watchProposalsOutside = false,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const usageExhausted = parseNumoUsageExhausted(message.metadata);

  if (message.role === "tool" || message.role === "system") return null;

  return (
    <Message
      from={isUser ? "user" : "assistant"}
      className="group max-w-full gap-2"
    >
      <div className="flex w-full flex-col">
        {isUser ? (
          // The full 85% column, not the bubble's width: the context row
          // measures this room, and a short follow-up's bubble left it only
          // enough for its "+N".
          <div className="ml-auto flex w-full max-w-[85%] flex-col items-end gap-1">
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
                {/* The accent, toned down to a readable surface; the public
                    documentation's Numo uses the same one (MessageContent).
                    Its pills sit on the page's background, not on the tint. */}
                <div className="chat-selectable mention-on-tint relative min-w-0 max-w-full break-words rounded-xl bg-[color-mix(in_oklab,var(--primary)_14%,var(--background))] px-4 py-2 text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
                  <UserText
                    content={message.content}
                    mentions={
                      Array.isArray(message.metadata?.mentions)
                        ? (message.metadata.mentions as AssistantMention[])
                        : []
                    }
                    skills={
                      Array.isArray(message.metadata?.skills)
                        ? (message.metadata.skills as AssistantSkillSelection[])
                        : []
                    }
                  />
                </div>
                <div className="-mt-0.5">
                  <MessageActions text={message.content} sentAt={message.created_at} side="end" />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            {message.content && (
              <>
                <MessageContent
                  // Full width, so a code block stretches across the answer.
                  className="chat-selectable relative w-full px-0 py-0 text-sm leading-relaxed text-foreground"
                >
                  <AssistantText content={message.content} />
                </MessageContent>
                {afterContent ? <div className="w-full">{afterContent}</div> : null}
                {showCopyButton && (
                  <div className="-mt-1">
                    <MessageActions
                      text={message.content}
                      sentAt={message.created_at}
                      side="start"
                      pinned={pinCopyButton}
                    />
                  </div>
                )}
              </>
            )}

            {usageExhausted ? (
              <NumoUsageExhaustedCard details={usageExhausted} />
            ) : null}

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
                watchProposals={!watchProposalsOutside}
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
            // Streamed calls sit in the turn's folded work: the shell draws a
            // reminder's approval card under the answer.
            watchProposals={false}
          />
        )}
      </div>
    </Message>
  );
}
