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
  cn,
  toast,
} from "mangue-ui";
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Github,
  Gitlab,
  Globe,
  Lock,
  MessagesSquare,
  Pencil,
  Plug,
  Trash2,
} from "lucide-react";
import { mcpActorLabel } from "@/lib/mcp-agents";
import {
  AutomationAvatar,
  McpAvatar,
  NumoAvatar,
  SmartAssignAvatar,
  SmartFillAvatar,
} from "@/components/actor-avatars";
import { isForgePrEvent, forgePrActor, type ForgeProvider } from "@/lib/pr-events";
import { getRepoProvider, parseForgeLogin } from "@/lib/repo-providers";
import { BotBadge } from "@/components/git/git-login";
import {
  describeEvent,
  describeFeedbackEvent,
  describeObjectiveEvent,
  describePageEvent,
  type EventContext,
  type EventTranslators,
} from "@/lib/describe-event";
import type { TimelineItem } from "@/lib/use-issue-timeline";
import { MentionTextarea, extractMentions } from "@/components/mention-textarea";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { toolRunningLabel } from "@/components/assistant/tool-call-display";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import {
  AttachButton,
  ResourcePills,
  DropOverlay,
  pasteFileHandler,
  useFileDrop,
} from "@/components/resources";
import { Markdown } from "@/components/markdown";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import { dueDateFormat, parseDueDate } from "@/lib/due-date";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { useCommentLive } from "@/lib/use-comment-live";
import type { Attachment, Comment, Member, ResourceInput } from "@/lib/types";
import type { CommentVisibility } from "@/lib/feedback/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * What a message must carry to be rendered by `CommentBlock` — the
 * common denominator of the FOUR threads of the app (MIN-282).
 *
 * The first three (ticket, objective, return) are lines of `comments` and
 * fill it entirely. The fourth, the thread of a page, lives in its
 * own table (`page_comments`) and has neither attachment nor public visibility,
 * no @Numo response in progress: hence the optional ones. It is this interface, and not
 * `Comment`, which says what this component actually READS — expanding it is what
 * avoided a fourth copy of the thread.
 */
export interface ThreadMessage {
  id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  via_assistant?: boolean;
  via_mcp?: boolean;
  api_key_name?: string | null;
  api_key_agent?: string | null;
  assistant_status?: "working" | "done" | "error" | null;
  assistant_tool?: string | null;
  visibility?: CommentVisibility;
  feedback_users?: Comment["feedback_users"];
  attachments?: Attachment[];
}

/**
 * A line of activity thread: a GESTURE, or a message.
 *
 * `TimelineItem` (lib/use-issue-timeline.ts) is the special case of the three
 * surfaces built on the table `comments`; it also accepts
 * messages from another table — the thread of a page (MIN-282), which lives in
 * `page_comments`. A `Comment` fills `ThreadMessage`, so the old ones
 * appelants passent tels quels.
 */
export type ActivityItem =
  | { kind: "event"; at: string; event: Extract<TimelineItem, { kind: "event" }>["event"] }
  | {
      kind: "comment";
      at: string;
      comment: ThreadMessage;
      replies: ThreadMessage[];
    };

type EventItem = Extract<ActivityItem, { kind: "event" }>;
type CommentItem = Extract<ActivityItem, { kind: "comment" }>;
/** The `Timeline` namespace translator — the one the helpers receive
 * below. Naming the namespace is not cosmetic: without it, the type
 * covers all 2,600 keys in the catalog and TypeScript aborts on one
 *  « type instantiation is excessively deep » (TS2589). */
type TimelineT = ReturnType<typeof useTranslations<"Timeline">>;
/** Which entity's activity we render — picks the event describer + status set. */
export type ActivityEntity = "issue" | "objective" | "feedback" | "page";

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
  // An actor outside the project (party account, system action) has no member
  // to borrow its seed: its name provides a stable fallback.
  const seed = (id ? members.find((m) => m.user_id === id)?.avatar_seed : null) ?? name;
  return <UserAvatar seed={seed} className={cn("size-5", className)} />;
}

/** Fallback avatar for a return from the board of which we do not know
    the author: the board acts as an actor. Known author → his own face,
    that of the author file (`authorAvatarSeed`). */
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
  // Smart-fill (MIN-260): same rules as Smart Assign — functionality
  // takes the place of an actor. Tested BEFORE `via_assistant` and company for the same
  // reason: the writing bears the id of the author of the ticket, which has nothing
  // made of these four properties.
  const viaSmartFill = !viaSmartAssign && !!item.event.via_smart_fill;
  // Project automation (MIN-147): the run leaves under the account of the assignee
  // — it’s from him that the key, the quota and the language come — but NO ONE
  // didn't click. Without this flag the timeline wrote “<assignee> launched the agent
  // Numo”, a gesture that this person did not make. Actor apart and not
  // “Numo”: the sentence already names the agent launched, it is the RULE which launched it.
  const viaAutomation = !viaSmartAssign && !viaSmartFill && !!item.event.via_automation;
  const viaNumo =
    !viaSmartAssign && !viaSmartFill && !viaAutomation && !!item.event.via_assistant;
  const viaMcp =
    !viaSmartAssign && !viaSmartFill && !viaAutomation && !viaNumo && !!item.event.via_mcp;
  const viaIntegration =
    !viaSmartAssign &&
    !viaSmartFill &&
    !viaAutomation &&
    !viaNumo &&
    !viaMcp &&
    !!item.event.integration_id;
  // Synchronization of the outputs of the linked repository (MIN-97): the writing technically carries
  // the id of the owner, but it is the forge which acted — it acts as an actor.
  const forgeSync = item.event.forge_sync
    ? getRepoProvider(item.event.forge_sync)
    : null;
  // PR/MR action done directly on the provider (GitHub/GitLab webhook):
  // no user minddy, the login provider (from_value, prefixed `gitlab:`
  // where applicable) acts as an actor, with the provider's logo.
  const viaForge = isForgePrEvent(item.event);
  const forgeActor = viaForge ? forgePrActor(item.event.from_value) : null;
  // A forge App (`vercel[bot]`, and ours when Numo grows): the name
  // on one side, the bot brand on the other — never `[bot]` in full.
  const forgeLogin = forgeActor?.login ? parseForgeLogin(forgeActor.login) : null;
  // Submission board (feedback): the author is an end user without
  // team identity, but it is not anonymous - the board has its
  // email (we contact him through him). It is therefore HIM that the line
  // name, like the author of the panel; the board does not act as an actor
  // only for the rare posts without a known author.
  const viaBoard =
    entity === "feedback" &&
    item.event.type === "created" &&
    item.event.field === "board";
  const boardAuthor = viaBoard ? ctx.feedbackAuthor ?? null : null;
  // via_mcp: the actor displayed is the AGENT (canonical name + logo), not
  // the user — the action can come from an automated workflow.
  const actor = actorName(ctx.members, item.event.actor_id, t);
  const name = forgeSync
    ? forgeSync.displayName
    : viaSmartAssign
    ? "Smart Assign"
    : viaSmartFill
    ? "Smart-fill"
    : viaAutomation
      ? t("automationActor")
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
              ? boardAuthor?.label ?? t("boardActor")
              : actor;
  const summary =
    entity === "feedback"
      ? describeFeedbackEvent(item.event, ctx, tr)
      : entity === "objective"
        ? describeObjectiveEvent(item.event, ctx, tr)
        : entity === "page"
          ? describePageEvent(item.event, ctx, tr)
          : describeEvent(item.event, ctx, tr);
  return (
    <li className="flex items-center gap-2.5">
      {forgeSync ? (
        <ForgeAvatar provider={forgeSync.id} />
      ) : viaSmartAssign ? (
        <SmartAssignAvatar />
      ) : viaSmartFill ? (
        <SmartFillAvatar />
      ) : viaAutomation ? (
        <AutomationAvatar />
      ) : viaNumo ? (
        <NumoAvatar />
      ) : forgeActor ? (
        <ForgeAvatar provider={forgeActor.provider} />
      ) : viaMcp ? (
        <McpAvatar agent={item.event.api_key_agent} />
      ) : viaIntegration ? (
        <IntegrationAvatar />
      ) : viaBoard ? (
        boardAuthor ? (
          <UserAvatar seed={boardAuthor.seed} className="size-5 shrink-0" />
        ) : (
          <BoardAvatar />
        )
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
    for the author — a hover "⋯" menu with inline edit and delete.
    Exported from MIN-282: the thread of a page mounts it as is. */
export function CommentBlock({
  comment,
  ctx,
  currentUserId,
  onEdit,
  onDelete,
  onDeleteAttachment,
  deletesReplies,
  isReply = false,
}: {
  comment: ThreadMessage;
  /** Only MEMBERS are read here (the author, his face, the pills of
      mention): the guy says it, so that a surface without objectives or
      categories — the thread of a page — does not have to create an empty setting. */
  ctx: Pick<EventContext, "members">;
  currentUserId: string | null;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
  deletesReplies: boolean;
  /** Message from a thread, not its root: the “Public” badge is not repeated at
      each line — the root and the tint of the card already say it, and five
      badges for a single idea read like noise. */
  isReply?: boolean;
}) {
  const t = useTranslations("Timeline");
  const tCommon = useTranslations("Common");
  const tAssistant = useTranslations("Assistant");
  const tToolCall = useTranslations("ToolCall");
  const viaNumo = !!comment.via_assistant;
  const viaMcp = !viaNumo && !!comment.via_mcp;
  const author = actorName(ctx.members, comment.author_id, t);
  // Public thread of a return (MIN-196). Two new features in this block, and one
  // only rule: here, in the TEAM view, we NAME the visitor. It is
  // exactly the opposite of the board, where he is just an avatar — and that's why
  // asked to connect before writing: without identity, there is no
  // no one to moderate. The avatar remains sown on the pseudonym: the same
  // face on both sides, to recognize at a glance on the board the
  // comment we just read here.
  const visitor = comment.feedback_users ?? null;
  const isPublic = comment.visibility === "public";
  const name = viaNumo
    ? "Numo"
    : viaMcp
      ? mcpActorName(comment.api_key_agent, comment.api_key_name, t)
      : visitor
        ? visitor.name?.trim() || visitor.email?.trim() || visitor.pseudonym
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
  // The text being written arrives through the topic of the comment, not through the
  // base: ~4 times per second, without thread refetch. The basic line remains the
  // fallback — it is she who sees the tab opened along the way, or the one which
  // missed a broadcast.
  const live = useCommentLive(comment.id, working);
  const liveTool = live ? live.tool : comment.assistant_tool;
  const liveBody = live ? live.text : comment.body;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mine = !!currentUserId && comment.author_id === currentUserId;
  const edited = comment.updated_at !== comment.created_at;
  /**
   * What we can do to this comment, and the two rules do not overlap
   * not.
   *
   * DELETE a comment PUBLIC is open to the entire team, regardless of who they are
   * the author — the rule follows where the words are, not the hand that wrote them
   * typed. They are on a page that the team publishes in its name: reserve the
   * withdrawal to the author leaving an abusive comment online until his return,
   * made the response of a colleague who had left unrecoverable, and left the
   * team responses taken over by the migration — without author by construction —
   * supprimables par personne.
   *
   * EDIT remains with the author. Rewriting someone else's words under one's name is not
   * moderation; and those of a VISITOR are never rewritten. To correct
   * a typo in one's own published response, however, remains permitted.
   */
  const canDelete = isPublic || (mine && !viaNumo);
  const canEdit = mine && !viaNumo && !visitor;

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
        ) : visitor ? (
          <UserAvatar seed={visitor.pseudonym} className="size-5" />
        ) : (
          <ActorAvatar members={ctx.members} id={comment.author_id} name={author} />
        )}
        <span className="min-w-0 truncate text-sm font-medium text-foreground">{name}</span>
        {/* What this comment commits, says before reading it: “Public” wants
            say that it is ON the board, readable by everyone. The absence of
            badge is the app-wide default — a team rating. */}
        {isPublic && !isReply && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-1.5 py-0.5 text-[11px] font-medium text-brand">
                <Globe className="size-3" />
                {t("publicComment")}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{t("publicCommentHint")}</TooltipContent>
          </Tooltip>
        )}
        <span className="shrink-0 text-xs text-muted-foreground/80">
          {timeAgo(comment.created_at, t)}
        </span>
        {edited && !viaNumo && !visitor && (
          <span className="shrink-0 text-xs text-muted-foreground/60">{t("edited")}</span>
        )}
        <span className="min-w-0 flex-1" />
        {/* ONE menu, two rules. It appears as soon as a gesture is possible:
            delete (any public comments, or his own) or edit (his
            only). Numo's comments remain read-only until
            that they are internal; published, they withdraw like the rest — it
            Someone has to be able to unpublish what an agent has published. */}
        {(canEdit || canDelete) && !editing && !working && (
          <DropdownMenu>
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
              {canEdit && (
                <DropdownMenuItem
                  onSelect={() => {
                    setDraft(comment.body);
                    setEditing(true);
                  }}
                >
                  <Pencil />
                  {tCommon("edit")}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 />
                  {tCommon("delete")}
                </DropdownMenuItem>
              )}
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
            <SendShortcutTooltip label={tCommon("save")}>
              <Button
                size="sm"
                className="rounded-full px-4"
                disabled={saving || !draft.trim()}
                onClick={() => void saveEdit()}
              >
                {saving && <Spinner />}
                {tCommon("save")}
              </Button>
            </SendShortcutTooltip>
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
        <ResourcePills
          resources={comment.attachments}
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
        // Deleting a PUBLIC message does not confirm as a team note:
        // what disappears is a page that people have read, and sometimes the
        // response given to them. The sentence must say it before the click.
        description={
          isPublic
            ? deletesReplies
              ? t("deletePublicThreadDescription")
              : t("deletePublicCommentDescription")
            : deletesReplies
              ? t("deleteThreadDescription")
              : t("deleteCommentDescription")
        }
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
    mention-aware composer targeting the thread's root comment.
    Exported from MIN-282: the thread of a page responds with the same gesture. */
export function ReplyComposer({
  members,
  currentUserId,
  projectId,
  rootId,
  threadIsPublic = false,
  allowAttachments = true,
  onReply,
}: {
  members: Member[];
  currentUserId: string | null;
  projectId: string;
  rootId: string;
  /**
   * The thread is PUBLIC (MIN-196): the response will go on the board, without
   * no one chose it here — a response inherits the visibility of its thread,
   * it's the server that decides and there is nothing to switch.
   *
   * Hence this flag, whose only role is to SAY it: without it, the gesture
   * more natural of the screen (reply to someone) would post on a page
   * indexable in the same suit as a team note.
   */
  threadIsPublic?: boolean;
  /**
   * The thread accepts ATTACHMENTS (MIN-282).
   *
   * False on a page, and this is not a simplification: a resource hangs
   * to a ticket, to an objective or to a return (`attachments_parent_ck`), therefore a
   * file dropped here would go to storage without ever finding a line where
   * hang on. The document already takes the images and files
   * (MIN-280) — this is where the gesture has meaning.
   */
  allowAttachments?: boolean;
  onReply: (
    parentId: string,
    body: string,
    mentionedUserIds: string[],
    attachments: ResourceInput[]
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
        <span>{threadIsPublic ? t("replyPublicPlaceholder") : t("replyPlaceholder")}</span>
      </button>
    );
  }
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-b-lg",
        // The same tune as the composer in public mode: what is written here leaves
        // in the same place, it should look the same.
        threadIsPublic && "bg-brand/[0.03]"
      )}
      onPaste={allowAttachments ? pasteFileHandler(uploads.addFiles) : undefined}
      {...(allowAttachments ? drop.handlers : {})}
    >
      <DropOverlay show={allowAttachments && drop.dragging} />
      {/* Attachments are context — they sit ABOVE the text being written. */}
      {allowAttachments && (
        <ResourcePills
          resources={uploads.pending.filter((p) => p.status === "done")}
          pending={uploads.pending}
          onRemove={(a) => {
            const match = uploads.pending.find((p) => p.storage_path === a.storage_path);
            if (match) uploads.remove(match.localId);
          }}
          onRemovePending={uploads.remove}
          className="px-3.5 pt-2.5"
        />
      )}
      <MentionTextarea
        value={draft}
        onChange={setDraft}
        members={members}
        onSubmit={() => void submit()}
        onEscape={() => {
          if (!draft.trim()) close();
        }}
        placeholder={threadIsPublic ? t("replyPublicPlaceholder") : t("replyPlaceholder")}
        autoFocus
        includeNumo
        className="rounded-none border-0 bg-transparent px-3.5 py-2.5 focus-visible:border-0 focus-visible:ring-0"
      />
      <div className="flex items-center justify-end gap-2 px-2.5 pb-2.5">
        {threadIsPublic && (
          <span className="mr-auto inline-flex items-center gap-1.5 text-xs font-medium text-brand">
            <Globe className="size-3.5" />
            {t("replyGoesPublic")}
          </span>
        )}
        {allowAttachments && (
          <AttachButton onFiles={uploads.addFiles} disabled={posting} />
        )}
        <Button variant="ghost" size="sm" className="rounded-full" onClick={close}>
          {tCommon("cancel")}
        </Button>
        <SendShortcutTooltip label={t("reply")}>
          <Button
            size="sm"
            className="rounded-full px-4"
            disabled={posting || !canPost}
            onClick={() => void submit()}
          >
            {posting && <Spinner />}
            {t("reply")}
          </Button>
        </SendShortcutTooltip>
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
  header,
  allowAttachments = true,
  onReply,
  onEditComment,
  onDeleteComment,
  onDeleteAttachment,
}: {
  item: CommentItem;
  ctx: EventContext;
  currentUserId: string | null;
  projectId: string;
  /** The headband, when the surface has one (see `commentHeader`). */
  header?: React.ReactNode;
  allowAttachments?: boolean;
  onReply: (
    parentId: string,
    body: string,
    mentionedUserIds: string[],
    attachments: ResourceInput[]
  ) => Promise<void>;
  onEditComment: (commentId: string, body: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
}) {
  // Visibility is read on the ROOT: it is this from which any response inherits.
  const threadIsPublic = item.comment.visibility === "public";
  return (
    <li
      className={cn(
        "flex flex-col rounded-lg border bg-card",
        // A public thread can be seen at a glance in a list that mixes it
        // two kinds: this is what distinguishes a team note from one
        // conversation that people read on the board.
        threadIsPublic ? "border-brand/30" : "border-border"
      )}
    >
      {header ? (
        <div className="border-b border-border/60 px-3.5 py-2">{header}</div>
      ) : null}
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
            isReply
          />
        </div>
      ))}
      <div className="border-t border-border/60">
        <ReplyComposer
          members={ctx.members}
          currentUserId={currentUserId}
          projectId={projectId}
          rootId={item.comment.id}
          threadIsPublic={threadIsPublic}
          allowAttachments={allowAttachments}
          onReply={onReply}
        />
      </div>
    </li>
  );
}

/** A run of events between two comments — collapsed behind "N events" so
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
    a run of 3+ events collapses into a "N events" accordion. */
function groupRows(
  items: ActivityItem[]
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
  commentHeader,
  allowAttachments = true,
  onReply,
  onEditComment,
  onDeleteComment,
  onDeleteAttachment,
}: {
  items: ActivityItem[];
  ctx: EventContext;
  /**
   * A strip clean to the surface, at the head of the card of a wire (MIN-282).
   *
   * The thread of a page puts there what no other surface has: the quoted extract, the
   * makes the commented block disappear, and the button that resolves. Give back
   * `null` adds nothing — a ticket has no banner.
   */
  commentHeader?: (comment: ThreadMessage) => React.ReactNode;
  /** Cf. `ReplyComposer`: false on a page, where a file has no line where
      s'accrocher. */
  allowAttachments?: boolean;
  currentUserId: string | null;
  projectId: string;
  /** Renders objective activity (event describer + status set) when "objective". */
  entity?: ActivityEntity;
  onReply: (
    parentId: string,
    body: string,
    mentionedUserIds: string[],
    attachments: ResourceInput[]
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
                    header={commentHeader?.(row.item.comment)}
                    allowAttachments={allowAttachments}
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
  publicOption,
  allowAttachments = true,
  placeholder,
  submitLabel,
  autoFocus = false,
}: {
  members: Member[];
  projectId: string;
  /** Cf. `ReplyComposer`: false on a page, where a file has no line
      where to hang on (MIN-282). */
  allowAttachments?: boolean;
  /** The wording of the empty field, when “Write a comment…” does not say this
      that we are doing (commenting on a PASSAGE, for example). */
  placeholder?: string;
  /** The submit button wording, same reason. */
  submitLabel?: string;
  autoFocus?: boolean;
  onSubmit: (
    body: string,
    mentionedUserIds: string[],
    attachments: ResourceInput[],
    visibility: CommentVisibility
  ) => Promise<void>;
  /**
   * The feedback thread can be addressed to two audiences (MIN-196): we offer
   * then the seesaw. Absent elsewhere — a ticket or objective has no
   * public page, and a toggle that only has one position is a lie.
   *
   * `disabledReason` (unpublished board) keeps the toggle VISIBLE but off,
   * with its reason: making it disappear would suggest that the returns
   * do not respond to each other, while a setting two screens away from here is missing.
   */
  publicOption?: { disabledReason?: string };
}) {
  const t = useTranslations("Timeline");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [visibility, setVisibility] = useState<CommentVisibility>("internal");
  const uploads = useAttachmentUploads(() => `projects/${projectId}`);
  const drop = useFileDrop(uploads.addFiles);
  const isPublic = visibility === "public";

  const canPost = (draft.trim() || uploads.inputs.length > 0) && !uploads.uploading;

  const submit = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      await onSubmit(
        draft.trim(),
        // A public comment does not carry any mention: it is addressed to those who have
        // write the return, not to a colleague.
        isPublic ? [] : extractMentions(draft, members),
        uploads.inputs,
        visibility
      );
      setDraft("");
      uploads.clear();
      // Return to “internal” after each sending. The two possible errors
      // are not equal: a team note written internally by mistake is not
      // costs nothing and can be repaired, a word published inadvertently has already been read.
      setVisibility("internal");
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
        allowAttachments && drop.dragging && "border-brand",
        // The composer CHANGES AIR when what we write goes onto the board.
        // A discreet pellet is missed; the edge of the field, no — and it is
        // the only thing someone is looking at while typing.
        isPublic && "border-brand/50 bg-brand/[0.03]"
      )}
      onPaste={allowAttachments ? pasteFileHandler(uploads.addFiles) : undefined}
      {...(allowAttachments ? drop.handlers : {})}
    >
      <DropOverlay show={allowAttachments && drop.dragging} />
      {/* Attachments are context — they sit ABOVE the text being written. */}
      {allowAttachments && (
        <ResourcePills
          resources={uploads.pending.filter((p) => p.status === "done")}
          pending={uploads.pending}
          onRemove={(a) => {
            const match = uploads.pending.find((p) => p.storage_path === a.storage_path);
            if (match) uploads.remove(match.localId);
          }}
          onRemovePending={uploads.remove}
          className="px-3.5 pt-2.5"
        />
      )}
      <MentionTextarea
        value={draft}
        onChange={setDraft}
        members={members}
        onSubmit={() => void submit()}
        placeholder={
          placeholder ??
          (isPublic ? t("publicCommentPlaceholder") : t("commentPlaceholder"))
        }
        autoFocus={autoFocus}
        dropUp
        includeNumo
        className="rounded-none border-0 bg-transparent px-3.5 py-2.5 focus-visible:border-0 focus-visible:ring-0"
      />
      {/* Dictate sits where the Comment button lives while the composer is
          empty, and slides to its left once there is text to post. */}
      <div className="flex items-center justify-end gap-1.5 px-2.5 pb-2.5">
        {publicOption && (
          <VisibilityToggle
            visibility={visibility}
            onChange={setVisibility}
            disabledReason={publicOption.disabledReason}
            disabled={posting}
          />
        )}
        <span className="min-w-0 flex-1" />
        {allowAttachments && (
          <AttachButton onFiles={uploads.addFiles} disabled={posting} />
        )}
        <DictateButton
          onTranscription={(text) =>
            setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))
          }
          disabled={posting}
        />
        {(canPost || posting) && (
          <SendShortcutTooltip label={submitLabel ?? t("comment")}>
            <Button
              size="sm"
              className="rounded-full px-4"
              disabled={posting || !canPost}
              onClick={() => void submit()}
            >
              {posting && <Spinner />}
              {submitLabel ?? t("comment")}
            </Button>
          </SendShortcutTooltip>
        )}
      </div>
    </div>
  );
}

/**
 * Who we write to: the team, or the board (MIN-196).
 *
 * One toggle button, not two tabs — there are only two positions,
 * and the one that counts is the one we LEAVE. When turned off, it says “Internal” to
 * gray of everything else on the screen; lit, it carries the globe and the color
 * branded, exactly the same as the thread's public comments badge
 * just above: the button and its result look similar.
 */
function VisibilityToggle({
  visibility,
  onChange,
  disabledReason,
  disabled,
}: {
  visibility: CommentVisibility;
  onChange: (next: CommentVisibility) => void;
  /** Unpublished board: the gesture has nowhere to end, we say why. */
  disabledReason?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("Timeline");
  const isPublic = visibility === "public";
  const locked = !!disabledReason;
  const button = (
    <button
      type="button"
      disabled={disabled || locked}
      aria-pressed={isPublic}
      onClick={() => onChange(isPublic ? "internal" : "public")}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        isPublic
          ? "border-brand/40 bg-brand/10 text-brand"
          : "border-transparent text-muted-foreground hover:bg-control hover:text-foreground",
        (disabled || locked) && "cursor-not-allowed opacity-50"
      )}
    >
      {isPublic ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
      {isPublic ? t("visibilityPublic") : t("visibilityInternal")}
    </button>
  );
  return (
    <Tooltip>
      {/* `span` carrier: a disabled button does not emit the events of
          hover that the tooltip needs — and it’s precisely disabled
          that she has the most to say. */}
      <TooltipTrigger asChild>
        <span className="flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {disabledReason ?? (isPublic ? t("visibilityPublicHint") : t("visibilityInternalHint"))}
      </TooltipContent>
    </Tooltip>
  );
}
