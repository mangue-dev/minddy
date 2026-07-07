"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import {
  Button,
  ConfirmDeleteDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import { Bot, ChevronDown, ChevronRight, Ellipsis, Pencil, Plug, Trash2 } from "lucide-react";
import { getMcpAgent, isMcpAgentId } from "@/lib/mcp-agents";
import {
  describeEvent,
  type EventContext,
  type EventTranslators,
} from "@/lib/describe-event";
import type { TimelineItem } from "@/lib/use-issue-timeline";
import { MentionTextarea, extractMentions } from "@/components/mention-textarea";
import { toolRunningLabel } from "@/components/assistant/tool-call-display";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { Markdown } from "@/components/markdown";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import { NumoIcon } from "@/components/numo-icon";
import { dueDateFormat, parseDueDate } from "@/lib/due-date";
import type { Comment, Member } from "@/lib/types";

type EventItem = Extract<TimelineItem, { kind: "event" }>;
type CommentItem = Extract<TimelineItem, { kind: "comment" }>;
type TimelineT = ReturnType<typeof useTranslations>;

/** Compact localized relative time, e.g. "Il y a 7min" / "7min ago". */
function timeAgo(iso: string, t: TimelineT): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 60) return t("now");
  const m = Math.round(s / 60);
  if (m < 60) return t("minutesAgo", { m });
  const h = Math.round(m / 60);
  if (h < 24) return t("hoursAgo", { h });
  const d = Math.round(h / 24);
  if (d < 7) return t("daysAgo", { d });
  const w = Math.round(d / 7);
  if (w < 5) return t("weeksAgo", { w });
  const mo = Math.round(d / 30);
  if (mo < 12) return t("monthsAgo", { mo });
  return t("yearsAgo", { y: Math.round(d / 365) });
}

function actorName(members: Member[], id: string | null, t: TimelineT): string {
  if (!id) return t("someone");
  const m = members.find((x) => x.user_id === id);
  return displayName(m, t("someUser"));
}

/** Bridge next-intl translators into the loose types describeEvent expects. */
function useEventTranslators(): EventTranslators {
  const tActivity = useTranslations("Activity");
  const tStatus = useTranslations("Status");
  const tPriority = useTranslations("Priority");
  const format = useFormatter();
  return {
    t: (key, values) =>
      tActivity(key as Parameters<typeof tActivity>[0], values as never),
    tStatus: (v) => tStatus(v as Parameters<typeof tStatus>[0]),
    tPriority: (v) => tPriority(v as Parameters<typeof tPriority>[0]),
    formatDue: (value) => {
      const d = parseDueDate(value);
      return d ? format.dateTime(d, dueDateFormat(d)) : "—";
    },
  };
}

/** Actor avatar (real photo when available, else colored initials), resolved
    from the members list by id. */
function ActorAvatar({
  members,
  id,
  name,
  className,
}: {
  members: Member[];
  id: string | null;
  name: string;
  className?: string;
}) {
  const url = id ? members.find((m) => m.user_id === id)?.avatar_url ?? null : null;
  return (
    <UserAvatar
      url={url}
      name={name}
      seed={id ?? name}
      className={cn("size-5 text-[9px]", className)}
    />
  );
}

/** Avatar for actions triggered through Numo — the assistant's face instead of
    the user's initials, so agent actions read as Numo's in the timeline. */
function NumoAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand",
        className,
      )}
    >
      <NumoIcon animated={false} className="size-3.5" />
    </span>
  );
}

/** Avatar for actions performed through the MCP endpoint — the acting agent's
    logo (Claude Code, Cursor…) when the key is tied to a known agent, else a
    generic bot. The actor is the AGENT, never the user. */
function McpAvatar({ agent, className }: { agent: string | null | undefined; className?: string }) {
  const known = isMcpAgentId(agent) ? getMcpAgent(agent) : null;
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand",
        className,
      )}
    >
      {known ? (
        known.logoDark ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={known.logo} alt="" className="size-3 dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={known.logoDark} alt="" className="hidden size-3 dark:block" />
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={known.logo} alt="" className="size-3" />
        )
      ) : (
        <Bot className="size-3.5" />
      )}
    </span>
  );
}

/** Avatar for issues submitted through a project integration (Feedback API) —
    a plug instead of a user's initials, so external submissions stand out. */
function IntegrationAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand",
        className,
      )}
    >
      <Plug className="size-3.5" />
    </span>
  );
}

/** One-line text that ellipsises and reveals the full text in a tooltip only
    when it actually overflows. */
function OneLine({ full, children }: { full: string; children: React.ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (el) setTruncated(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  const p = (
    <p ref={ref} className="min-w-0 flex-1 truncate text-sm">
      {children}
    </p>
  );
  if (!truncated) return p;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{p}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{full}</TooltipContent>
    </Tooltip>
  );
}

function EventRow({ item, ctx }: { item: EventItem; ctx: EventContext }) {
  const t = useTranslations("Timeline");
  const tr = useEventTranslators();
  const viaNumo = !!item.event.via_assistant;
  const viaMcp = !viaNumo && !!item.event.via_mcp;
  const viaIntegration = !viaNumo && !viaMcp && !!item.event.integration_id;
  // via_mcp : l'acteur affiché est l'AGENT (nom de la clé API + logo), pas
  // l'utilisateur — l'action peut venir d'un workflow automatisé.
  const actor = actorName(ctx.members, item.event.actor_id, t);
  const name = viaNumo
    ? "Numo"
    : viaIntegration
      ? t("integrationActor", {
          name: item.event.integration_name ?? t("integrationFallback"),
        })
      : viaMcp
        ? t("mcpActor", { name: item.event.api_key_name ?? t("mcpFallback") })
        : actor;
  const summary = describeEvent(item.event, ctx, tr);
  return (
    <li className="flex items-center gap-2.5">
      {viaNumo ? (
        <NumoAvatar />
      ) : viaMcp ? (
        <McpAvatar agent={item.event.api_key_agent} />
      ) : viaIntegration ? (
        <IntegrationAvatar />
      ) : (
        <ActorAvatar members={ctx.members} id={item.event.actor_id} name={actor} />
      )}
      <OneLine full={`${name} ${summary}`}>
        <span className="font-medium text-foreground">{name}</span>{" "}
        <span className="text-muted-foreground">{summary}</span>
      </OneLine>
      <span className="shrink-0 text-xs text-muted-foreground/80">
        {timeAgo(item.event.created_at, t)}
      </span>
    </li>
  );
}

/** One comment inside a card (root or reply): header, markdown body, and —
    for the author — a hover "⋯" menu with inline edit and delete. */
function CommentBlock({
  comment,
  ctx,
  currentUserId,
  onEdit,
  onDelete,
  deletesReplies,
}: {
  comment: Comment;
  ctx: EventContext;
  currentUserId: string | null;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  deletesReplies: boolean;
}) {
  const t = useTranslations("Timeline");
  const tCommon = useTranslations("Common");
  const tAssistant = useTranslations("Assistant");
  const tToolCall = useTranslations("ToolCall");
  const viaNumo = !!comment.via_assistant;
  const viaMcp = !viaNumo && !!comment.via_mcp;
  const author = actorName(ctx.members, comment.author_id, t);
  // via_mcp : l'auteur affiché est l'AGENT (nom de la clé API + logo), pas
  // l'utilisateur ; le propriétaire (author_id) garde édition et suppression.
  const name = viaNumo
    ? "Numo"
    : viaMcp
      ? t("mcpActor", { name: comment.api_key_name ?? t("mcpFallback") })
      : author;
  // Live @Numo reply: 'working' comments update in place (current tool, then
  // streaming text) via Realtime until only the final message remains. A
  // 'working' row older than 5 minutes is an orphan (server died) → error.
  const stale =
    comment.assistant_status === "working" &&
    Date.now() - new Date(comment.created_at).getTime() > 5 * 60_000;
  const working = comment.assistant_status === "working" && !stale;
  const failed = comment.assistant_status === "error" || stale;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mine = !!currentUserId && comment.author_id === currentUserId;
  const edited = comment.updated_at !== comment.created_at;

  const saveEdit = async () => {
    const body = draft.trim();
    if (!body || body === comment.body) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onEdit(comment.id, body);
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="group/comment flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {viaNumo ? (
          <NumoAvatar />
        ) : viaMcp ? (
          <McpAvatar agent={comment.api_key_agent} />
        ) : (
          <ActorAvatar members={ctx.members} id={comment.author_id} name={author} />
        )}
        <span className="min-w-0 truncate text-sm font-medium text-foreground">{name}</span>
        <span className="shrink-0 text-xs text-muted-foreground/80">
          {timeAgo(comment.created_at, t)}
        </span>
        {edited && !viaNumo && (
          <span className="shrink-0 text-xs text-muted-foreground/60">{t("edited")}</span>
        )}
        <span className="min-w-0 flex-1" />
        {/* Numo's comments are read-only for users (no edit, no delete — RLS
            enforces both); deleting one's own thread root still cascades. */}
        {mine && !editing && !working && !viaNumo && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("commentActions")}
                className="-my-1 size-6 rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/comment:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              >
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
              >
                <Pencil />
                {tCommon("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 />
                {tCommon("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {working ? (
        // One live line at a time: the current tool, else the text being
        // written, else a plain "Working…" — each update replaces the previous.
        comment.assistant_tool ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate italic">
              {toolRunningLabel(comment.assistant_tool, tToolCall)}
            </span>
          </div>
        ) : comment.body ? (
          <div className="flex flex-col gap-1.5">
            <Markdown className="text-foreground" members={ctx.members}>
              {comment.body}
            </Markdown>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3 shrink-0" />
              <span className="italic">{tAssistant("working")}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-3.5 shrink-0" />
            <span className="italic">{tAssistant("working")}</span>
          </div>
        )
      ) : failed ? (
        <p className="text-sm italic text-muted-foreground">
          {tAssistant("commentError")}
        </p>
      ) : editing ? (
        <div className="flex flex-col gap-2">
          <MentionTextarea
            value={draft}
            onChange={setDraft}
            members={ctx.members}
            onSubmit={() => void saveEdit()}
            onEscape={() => setEditing(false)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setEditing(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              size="sm"
              className="rounded-full px-4"
              disabled={saving || !draft.trim()}
              onClick={() => void saveEdit()}
            >
              {saving && <Spinner />}
              {tCommon("save")}
            </Button>
          </div>
        </div>
      ) : (
        <Markdown className="text-foreground" members={ctx.members}>
          {comment.body}
        </Markdown>
      )}
      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteCommentTitle")}
        description={deletesReplies ? t("deleteThreadDescription") : t("deleteCommentDescription")}
        confirmLabel={tCommon("delete")}
        onConfirm={async () => {
          try {
            await onDelete(comment.id);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

/** Collapsed "Reply…" affordance at the bottom of a card, expanding into a
    mention-aware composer targeting the thread's root comment. */
function ReplyComposer({
  members,
  currentUserId,
  rootId,
  onReply,
}: {
  members: Member[];
  currentUserId: string | null;
  rootId: string;
  onReply: (parentId: string, body: string, mentionedUserIds: string[]) => Promise<void>;
}) {
  const t = useTranslations("Timeline");
  const tCommon = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const meName = actorName(members, currentUserId, t);

  const close = () => {
    setDraft("");
    setOpen(false);
  };

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      await onReply(rootId, body, extractMentions(draft, members));
      close();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-b-lg px-3.5 py-2.5 text-left text-sm text-muted-foreground outline-none transition-colors hover:text-foreground"
      >
        <ActorAvatar members={members} id={currentUserId} name={meName} />
        <span>{t("replyPlaceholder")}</span>
      </button>
    );
  }
  return (
    <div className="flex flex-col">
      <MentionTextarea
        value={draft}
        onChange={setDraft}
        members={members}
        onSubmit={() => void submit()}
        onEscape={() => {
          if (!draft.trim()) close();
        }}
        placeholder={t("replyPlaceholder")}
        autoFocus
        includeNumo
        className="rounded-none border-0 bg-transparent px-3.5 py-2.5 focus-visible:border-0 focus-visible:ring-0"
      />
      <div className="flex items-center justify-end gap-2 px-2.5 pb-2.5">
        <Button variant="ghost" size="sm" className="rounded-full" onClick={close}>
          {tCommon("cancel")}
        </Button>
        <Button
          size="sm"
          className="rounded-full px-4"
          disabled={posting || !draft.trim()}
          onClick={() => void submit()}
        >
          {posting && <Spinner />}
          {t("reply")}
        </Button>
        {/* Dictate at the far right of the reply row (spec). */}
        <DictateButton
          onTranscription={(text) =>
            setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))
          }
          disabled={posting}
        />
      </div>
    </div>
  );
}

/** A comment thread as an isolated card: root comment, divider-separated
    replies (flat, Linear-style), and the reply affordance. */
function CommentCard({
  item,
  ctx,
  currentUserId,
  onReply,
  onEditComment,
  onDeleteComment,
}: {
  item: CommentItem;
  ctx: EventContext;
  currentUserId: string | null;
  onReply: (parentId: string, body: string, mentionedUserIds: string[]) => Promise<void>;
  onEditComment: (commentId: string, body: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}) {
  return (
    <li className="flex flex-col rounded-lg border border-border bg-card">
      <div className="px-3.5 py-3">
        <CommentBlock
          comment={item.comment}
          ctx={ctx}
          currentUserId={currentUserId}
          onEdit={onEditComment}
          onDelete={onDeleteComment}
          deletesReplies={item.replies.length > 0}
        />
      </div>
      {item.replies.map((reply) => (
        <div key={reply.id} className="border-t border-border/60 px-3.5 py-3">
          <CommentBlock
            comment={reply}
            ctx={ctx}
            currentUserId={currentUserId}
            onEdit={onEditComment}
            onDelete={onDeleteComment}
            deletesReplies={false}
          />
        </div>
      ))}
      <div className="border-t border-border/60">
        <ReplyComposer
          members={ctx.members}
          currentUserId={currentUserId}
          rootId={item.comment.id}
          onReply={onReply}
        />
      </div>
    </li>
  );
}

/** A run of events between two comments — collapsed behind "N événements" so
    the surrounding comments stand out. */
function EventsGroup({ items, ctx }: { items: EventItem[]; ctx: EventContext }) {
  const t = useTranslations("Timeline");
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 text-left outline-none"
      >
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </span>
        <span className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          {t("eventsCount", { count: items.length })}
        </span>
      </button>
      {open && (
        <ol className="mt-3 flex flex-col gap-3">
          {items.map((it) => (
            <EventRow key={`e-${it.event.id}`} item={it} ctx={ctx} />
          ))}
        </ol>
      )}
    </li>
  );
}

/** Groups consecutive events (delimited by comments) so comments stay isolated;
    a run of 3+ events collapses into a "N événements" accordion. */
function groupRows(
  items: TimelineItem[]
): ({ type: "comment"; item: CommentItem } | { type: "events"; items: EventItem[] })[] {
  const rows: ({ type: "comment"; item: CommentItem } | { type: "events"; items: EventItem[] })[] = [];
  let buffer: EventItem[] = [];
  const flush = () => {
    if (buffer.length) {
      rows.push({ type: "events", items: buffer });
      buffer = [];
    }
  };
  for (const it of items) {
    if (it.kind === "comment") {
      flush();
      rows.push({ type: "comment", item: it });
    } else {
      buffer.push(it);
    }
  }
  flush();
  return rows;
}

/** Minimalist activity feed inside a collapsible section. */
export function IssueActivity({
  items,
  ctx,
  currentUserId,
  onReply,
  onEditComment,
  onDeleteComment,
}: {
  items: TimelineItem[];
  ctx: EventContext;
  currentUserId: string | null;
  onReply: (parentId: string, body: string, mentionedUserIds: string[]) => Promise<void>;
  onEditComment: (commentId: string, body: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}) {
  const t = useTranslations("Timeline");
  const [open, setOpen] = useState(true);
  const rows = groupRows(items);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between py-1 text-sm font-medium outline-none"
      >
        <span>{t("activity")}</span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            !open && "-rotate-90"
          )}
        />
      </button>

      {open &&
        (rows.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("noActivity")}</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-3">
            {rows.map((row, i) => {
              if (row.type === "comment") {
                return (
                  <CommentCard
                    key={`c-${row.item.comment.id}`}
                    item={row.item}
                    ctx={ctx}
                    currentUserId={currentUserId}
                    onReply={onReply}
                    onEditComment={onEditComment}
                    onDeleteComment={onDeleteComment}
                  />
                );
              }
              if (row.items.length > 2) {
                return <EventsGroup key={`g-${i}`} items={row.items} ctx={ctx} />;
              }
              return row.items.map((it) => (
                <EventRow key={`e-${it.event.id}`} item={it} ctx={ctx} />
              ));
            })}
          </ol>
        ))}
    </div>
  );
}

/** Fixed comment composer (panel footer). */
export function CommentComposer({
  members,
  onSubmit,
}: {
  members: Member[];
  onSubmit: (body: string, mentionedUserIds: string[]) => Promise<void>;
}) {
  const t = useTranslations("Timeline");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      await onSubmit(body, extractMentions(draft, members));
      setDraft("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="w-full rounded-lg border border-border bg-card transition-colors focus-within:border-ring">
      <MentionTextarea
        value={draft}
        onChange={setDraft}
        members={members}
        onSubmit={() => void submit()}
        placeholder={t("commentPlaceholder")}
        dropUp
        includeNumo
        className="rounded-none border-0 bg-transparent px-3.5 py-2.5 focus-visible:border-0 focus-visible:ring-0"
      />
      {/* Dictate sits where the Comment button lives while the composer is
          empty, and slides to its left once there is text to post. */}
      <div className="flex items-center justify-end gap-1.5 px-2.5 pb-2.5">
        <DictateButton
          onTranscription={(text) =>
            setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))
          }
          disabled={posting}
        />
        {(draft.trim() || posting) && (
          <Button
            size="sm"
            className="rounded-full px-4"
            disabled={posting || !draft.trim()}
            onClick={() => void submit()}
          >
            {posting && <Spinner />}
            {t("comment")}
          </Button>
        )}
      </div>
    </div>
  );
}
