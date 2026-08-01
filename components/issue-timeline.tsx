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
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Github,
  Gitlab,
  MessagesSquare,
  Pencil,
  Plug,
  Trash2,
} from "lucide-react";
import { mcpActorLabel } from "@/lib/mcp-agents";
import {
  McpAvatar,
  NumoAvatar,
  SmartAssignAvatar,
} from "@/components/actor-avatars";
import { isForgePrEvent, forgePrActor, type ForgeProvider } from "@/lib/pr-events";
import { getRepoProvider, parseForgeLogin } from "@/lib/repo-providers";
import { BotBadge } from "@/components/git/git-login";
import {
  describeEvent,
  describeFeedbackEvent,
  describeObjectiveEvent,
  type EventContext,
  type EventTranslators,
} from "@/lib/describe-event";
import type { TimelineItem } from "@/lib/use-issue-timeline";
import { MentionTextarea, extractMentions } from "@/components/mention-textarea";
import { toolRunningLabel } from "@/components/assistant/tool-call-display";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import {
  AttachButton,
  AttachmentPills,
  DropOverlay,
  pasteFileHandler,
  useFileDrop,
} from "@/components/attachments";
import { Markdown } from "@/components/markdown";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import { dueDateFormat, parseDueDate } from "@/lib/due-date";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { useCommentLive } from "@/lib/use-comment-live";
import type { AttachmentInput, Comment, Member } from "@/lib/types";

type EventItem = Extract<TimelineItem, { kind: "event" }>;
type CommentItem = Extract<TimelineItem, { kind: "comment" }>;
/** Le translator du namespace `Timeline` — celui que reçoivent les helpers
 *  ci-dessous. Nommer le namespace n'est pas cosmétique : sans lui, le type
 *  couvre les 2 600 clés du catalogue et TypeScript abandonne sur un
 *  « type instantiation is excessively deep » (TS2589). */
type TimelineT = ReturnType<typeof useTranslations<"Timeline">>;
/** Which entity's activity we render — picks the event describer + status set. */
export type ActivityEntity = "issue" | "objective" | "feedback";

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

/** Display name for an action performed through the MCP endpoint (shared with
    the inbox — see `mcpActorLabel`); only the fallback wording is local. */
const mcpActorName = (
  agent: string | null | undefined,
  keyName: string | null | undefined,
  t: TimelineT,
): string => mcpActorLabel(agent, keyName, t("mcpFallback"));

/** Bridge next-intl translators into the loose types describeEvent expects. */
function useEventTranslators(): EventTranslators {
  const tActivity = useTranslations("Activity");
  const tStatus = useTranslations("Status");
  const tPriority = useTranslations("Priority");
  const tObjectiveStatus = useTranslations("ObjectiveStatus");
  const tFeedback = useTranslations("PublicFeedback");
  const tRecurrence = useTranslations("Recurrence");
  const format = useFormatter();
  return {
    t: (key, values) =>
      tActivity(key as Parameters<typeof tActivity>[0], values as never),
    tStatus: (v) => tStatus(v as Parameters<typeof tStatus>[0]),
    tPriority: (v) => tPriority(v as Parameters<typeof tPriority>[0]),
    tObjectiveStatus: (v) =>
      tObjectiveStatus(v as Parameters<typeof tObjectiveStatus>[0]),
    tFeedbackStatus: (v) =>
      tFeedback(`status.${v}` as Parameters<typeof tFeedback>[0]),
    tRecurrence: (v) => tRecurrence(v as Parameters<typeof tRecurrence>[0]),
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
  // Un acteur hors projet (compte parti, action système) n'a pas de membre à
  // qui emprunter sa graine : son nom fait un repli stable.
  const seed = (id ? members.find((m) => m.user_id === id)?.avatar_seed : null) ?? name;
  return <UserAvatar seed={seed} className={cn("size-5", className)} />;
}

/** Avatar for feedback submitted through the public board — the anonymous
    end-user has no team identity, so the board itself stands in as the actor. */
function BoardAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand",
        className,
      )}
    >
      <MessagesSquare className="size-3" />
    </span>
  );
}

/** Avatar for PR/MR actions performed directly on the provider (accepted /
    rejected / approved / changes requested via the webhook) — the forge's mark,
    the actor being the GitHub/GitLab user rather than a minddy member. */
function ForgeAvatar({
  provider,
  className,
}: {
  provider: ForgeProvider;
  className?: string;
}) {
  const Icon = provider === "gitlab" ? Gitlab : Github;
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand",
        className,
      )}
    >
      <Icon className="size-3" />
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

function EventRow({
  item,
  ctx,
  entity = "issue",
}: {
  item: EventItem;
  ctx: EventContext;
  entity?: ActivityEntity;
}) {
  const t = useTranslations("Timeline");
  const tr = useEventTranslators();
  const viaSmartAssign = !!item.event.via_smart_assign;
  const viaNumo = !viaSmartAssign && !!item.event.via_assistant;
  const viaMcp = !viaSmartAssign && !viaNumo && !!item.event.via_mcp;
  const viaIntegration =
    !viaSmartAssign && !viaNumo && !viaMcp && !!item.event.integration_id;
  // Synchro des issues du dépôt lié (MIN-97) : l'écriture porte techniquement
  // l'id du owner, mais c'est la forge qui a agi — elle tient lieu d'acteur.
  const forgeSync = item.event.forge_sync
    ? getRepoProvider(item.event.forge_sync)
    : null;
  // Action PR/MR faite directement sur le provider (webhook GitHub/GitLab) :
  // pas d'utilisateur minddy, le login provider (from_value, préfixé `gitlab:`
  // le cas échéant) tient lieu d'acteur, avec le logo du provider.
  const viaForge = isForgePrEvent(item.event);
  const forgeActor = viaForge ? forgePrActor(item.event.from_value) : null;
  // Une App de la forge (`vercel[bot]`, et le nôtre quand Numo pousse) : le nom
  // d'un côté, la marque de bot de l'autre — jamais `[bot]` en toutes lettres.
  const forgeLogin = forgeActor?.login ? parseForgeLogin(forgeActor.login) : null;
  // Soumission board (feedback) : l'auteur est un utilisateur final anonyme
  // sans identité équipe — le board tient lieu d'acteur.
  const viaBoard =
    entity === "feedback" &&
    item.event.type === "created" &&
    item.event.field === "board";
  // via_mcp : l'acteur affiché est l'AGENT (nom canonique + logo), pas
  // l'utilisateur — l'action peut venir d'un workflow automatisé.
  const actor = actorName(ctx.members, item.event.actor_id, t);
  const name = forgeSync
    ? forgeSync.displayName
    : viaSmartAssign
    ? "Smart Assign"
    : viaNumo
      ? "Numo"
      : forgeActor
        ? (forgeLogin?.name ?? getRepoProvider(forgeActor.provider).displayName)
        : viaIntegration
          ? t("integrationActor", {
              name: item.event.integration_name ?? t("integrationFallback"),
            })
          : viaMcp
            ? mcpActorName(item.event.api_key_agent, item.event.api_key_name, t)
            : viaBoard
              ? t("boardActor")
              : actor;
  const summary =
    entity === "feedback"
      ? describeFeedbackEvent(item.event, ctx, tr)
      : entity === "objective"
        ? describeObjectiveEvent(item.event, ctx, tr)
        : describeEvent(item.event, ctx, tr);
  return (
    <li className="flex items-center gap-2.5">
      {forgeSync ? (
        <ForgeAvatar provider={forgeSync.id} />
      ) : viaSmartAssign ? (
        <SmartAssignAvatar />
      ) : viaNumo ? (
        <NumoAvatar />
      ) : forgeActor ? (
        <ForgeAvatar provider={forgeActor.provider} />
      ) : viaMcp ? (
        <McpAvatar agent={item.event.api_key_agent} />
      ) : viaIntegration ? (
        <IntegrationAvatar />
      ) : viaBoard ? (
        <BoardAvatar />
      ) : (
        <ActorAvatar members={ctx.members} id={item.event.actor_id} name={actor} />
      )}
      <OneLine full={`${name} ${summary}`}>
        <span className="font-medium text-foreground">{name}</span>
        {forgeLogin?.isBot ? <BotBadge className="ml-1" /> : null}{" "}
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
  onDeleteAttachment,
  deletesReplies,
}: {
  comment: Comment;
  ctx: EventContext;
  currentUserId: string | null;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
  deletesReplies: boolean;
}) {
  const t = useTranslations("Timeline");
  const tCommon = useTranslations("Common");
  const tAssistant = useTranslations("Assistant");
  const tToolCall = useTranslations("ToolCall");
  const viaNumo = !!comment.via_assistant;
  const viaMcp = !viaNumo && !!comment.via_mcp;
  const author = actorName(ctx.members, comment.author_id, t);
  // via_mcp : l'auteur affiché est l'AGENT (nom canonique + logo), pas
  // l'utilisateur ; le propriétaire (author_id) garde édition et suppression.
  const name = viaNumo
    ? "Numo"
    : viaMcp
      ? mcpActorName(comment.api_key_agent, comment.api_key_name, t)
      : author;
  // Live @Numo reply: 'working' comments update in place (current tool, then
  // streaming text) until only the final message remains. A 'working' row older
  // than 5 minutes is an orphan (server died) → error; the timeline polls while
  // one is live, so this is re-evaluated instead of freezing on a spinner.
  const stale =
    comment.assistant_status === "working" &&
    Date.now() - new Date(comment.created_at).getTime() > 5 * 60_000;
  const working = comment.assistant_status === "working" && !stale;
  const failed = comment.assistant_status === "error" || stale;
  // Le texte en train de s'écrire arrive par le topic du commentaire, pas par la
  // base : ~4 fois par seconde, sans refetch du fil. La ligne en base reste le
  // repli — c'est elle que voit l'onglet ouvert en cours de route, ou celui qui
  // a manqué une diffusion.
  const live = useCommentLive(comment.id, working);
  const liveTool = live ? live.tool : comment.assistant_tool;
  const liveBody = live ? live.text : comment.body;
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
        liveTool ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate italic">
              {toolRunningLabel(liveTool, tToolCall)}
            </span>
          </div>
        ) : liveBody ? (
          <div className="flex flex-col gap-1.5">
            <Markdown className="text-foreground" members={ctx.members}>
              {liveBody}
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
        comment.body && (
          <Markdown className="text-foreground" members={ctx.members}>
            {comment.body}
          </Markdown>
        )
      )}
      {!working && !failed && (comment.attachments?.length ?? 0) > 0 && (
        <AttachmentPills
          attachments={comment.attachments}
          onRemove={
            mine
              ? (a) => {
                  if (a.id) {
                    onDeleteAttachment(a.id).catch((e) =>
                      toast.error((e as Error).message)
                    );
                  }
                }
              : undefined
          }
        />
      )}
      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteCommentTitle")}
        description={deletesReplies ? t("deleteThreadDescription") : t("deleteCommentDescription")}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
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
  projectId,
  rootId,
  onReply,
}: {
  members: Member[];
  currentUserId: string | null;
  projectId: string;
  rootId: string;
  onReply: (
    parentId: string,
    body: string,
    mentionedUserIds: string[],
    attachments: AttachmentInput[]
  ) => Promise<void>;
}) {
  const t = useTranslations("Timeline");
  const tCommon = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const uploads = useAttachmentUploads(() => `projects/${projectId}`);
  const drop = useFileDrop(uploads.addFiles);
  const meName = actorName(members, currentUserId, t);

  const close = () => {
    setDraft("");
    uploads.clear();
    setOpen(false);
  };

  const canPost = (draft.trim() || uploads.inputs.length > 0) && !uploads.uploading;

  const submit = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      await onReply(rootId, draft.trim(), extractMentions(draft, members), uploads.inputs);
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
    <div
      className="relative flex flex-col rounded-b-lg"
      onPaste={pasteFileHandler(uploads.addFiles)}
      {...drop.handlers}
    >
      <DropOverlay show={drop.dragging} />
      {/* Attachments are context — they sit ABOVE the text being written. */}
      <AttachmentPills
        attachments={uploads.pending.filter((p) => p.status === "done")}
        pending={uploads.pending}
        onRemove={(a) => {
          const match = uploads.pending.find((p) => p.storage_path === a.storage_path);
          if (match) uploads.remove(match.localId);
        }}
        onRemovePending={uploads.remove}
        className="px-3.5 pt-2.5"
      />
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
        <AttachButton onFiles={uploads.addFiles} disabled={posting} />
        <Button variant="ghost" size="sm" className="rounded-full" onClick={close}>
          {tCommon("cancel")}
        </Button>
        <Button
          size="sm"
          className="rounded-full px-4"
          disabled={posting || !canPost}
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
  projectId,
  onReply,
  onEditComment,
  onDeleteComment,
  onDeleteAttachment,
}: {
  item: CommentItem;
  ctx: EventContext;
  currentUserId: string | null;
  projectId: string;
  onReply: (
    parentId: string,
    body: string,
    mentionedUserIds: string[],
    attachments: AttachmentInput[]
  ) => Promise<void>;
  onEditComment: (commentId: string, body: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
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
          onDeleteAttachment={onDeleteAttachment}
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
            onDeleteAttachment={onDeleteAttachment}
            deletesReplies={false}
          />
        </div>
      ))}
      <div className="border-t border-border/60">
        <ReplyComposer
          members={ctx.members}
          currentUserId={currentUserId}
          projectId={projectId}
          rootId={item.comment.id}
          onReply={onReply}
        />
      </div>
    </li>
  );
}

/** A run of events between two comments — collapsed behind "N événements" so
    the surrounding comments stand out. */
function EventsGroup({
  items,
  ctx,
  entity = "issue",
}: {
  items: EventItem[];
  ctx: EventContext;
  entity?: ActivityEntity;
}) {
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
            <EventRow key={`e-${it.event.id}`} item={it} ctx={ctx} entity={entity} />
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
  projectId,
  entity = "issue",
  onReply,
  onEditComment,
  onDeleteComment,
  onDeleteAttachment,
}: {
  items: TimelineItem[];
  ctx: EventContext;
  currentUserId: string | null;
  projectId: string;
  /** Renders objective activity (event describer + status set) when "objective". */
  entity?: ActivityEntity;
  onReply: (
    parentId: string,
    body: string,
    mentionedUserIds: string[],
    attachments: AttachmentInput[]
  ) => Promise<void>;
  onEditComment: (commentId: string, body: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
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
                    projectId={projectId}
                    onReply={onReply}
                    onEditComment={onEditComment}
                    onDeleteComment={onDeleteComment}
                    onDeleteAttachment={onDeleteAttachment}
                  />
                );
              }
              if (row.items.length > 2) {
                return (
                  <EventsGroup key={`g-${i}`} items={row.items} ctx={ctx} entity={entity} />
                );
              }
              return row.items.map((it) => (
                <EventRow key={`e-${it.event.id}`} item={it} ctx={ctx} entity={entity} />
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
  projectId,
  onSubmit,
}: {
  members: Member[];
  projectId: string;
  onSubmit: (
    body: string,
    mentionedUserIds: string[],
    attachments: AttachmentInput[]
  ) => Promise<void>;
}) {
  const t = useTranslations("Timeline");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const uploads = useAttachmentUploads(() => `projects/${projectId}`);
  const drop = useFileDrop(uploads.addFiles);

  const canPost = (draft.trim() || uploads.inputs.length > 0) && !uploads.uploading;

  const submit = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      await onSubmit(draft.trim(), extractMentions(draft, members), uploads.inputs);
      setDraft("");
      uploads.clear();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      className={cn(
        "relative w-full rounded-lg border border-border bg-card transition-colors focus-within:border-ring",
        drop.dragging && "border-brand"
      )}
      onPaste={pasteFileHandler(uploads.addFiles)}
      {...drop.handlers}
    >
      <DropOverlay show={drop.dragging} />
      {/* Attachments are context — they sit ABOVE the text being written. */}
      <AttachmentPills
        attachments={uploads.pending.filter((p) => p.status === "done")}
        pending={uploads.pending}
        onRemove={(a) => {
          const match = uploads.pending.find((p) => p.storage_path === a.storage_path);
          if (match) uploads.remove(match.localId);
        }}
        onRemovePending={uploads.remove}
        className="px-3.5 pt-2.5"
      />
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
        <AttachButton onFiles={uploads.addFiles} disabled={posting} />
        <DictateButton
          onTranscription={(text) =>
            setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))
          }
          disabled={posting}
        />
        {(canPost || posting) && (
          <Button
            size="sm"
            className="rounded-full px-4"
            disabled={posting || !canPost}
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
