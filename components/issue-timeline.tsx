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

/**
 * Ce qu'un message doit porter pour être rendu par `CommentBlock` — le
 * dénominateur commun des QUATRE fils de l'app (MIN-282).
 *
 * Les trois premiers (ticket, objectif, retour) sont des lignes de `comments` et
 * le remplissent tout entier. Le quatrième, le fil d'une page, vit dans sa
 * propre table (`page_comments`) et n'a ni pièce jointe, ni visibilité publique,
 * ni réponse @Numo en cours : d'où les optionnels. C'est cette interface, et non
 * `Comment`, qui dit ce que ce composant LIT vraiment — l'élargir est ce qui a
 * évité une quatrième copie du fil.
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

type EventItem = Extract<TimelineItem, { kind: "event" }>;
type CommentItem = Extract<TimelineItem, { kind: "comment" }>;
/** Le translator du namespace `Timeline` — celui que reçoivent les helpers
 *  ci-dessous. Nommer le namespace n'est pas cosmétique : sans lui, le type
 *  couvre les 2 600 clés du catalogue et TypeScript abandonne sur un
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
  // Un acteur hors projet (compte parti, action système) n'a pas de membre à
  // qui emprunter sa graine : son nom fait un repli stable.
  const seed = (id ? members.find((m) => m.user_id === id)?.avatar_seed : null) ?? name;
  return <UserAvatar seed={seed} className={cn("size-5", className)} />;
}

/** Avatar de repli pour un retour venu du board dont on ne connaît pas
    l'auteur : le board tient lieu d'acteur. Auteur connu → son propre visage,
    celui de la fiche auteur (`authorAvatarSeed`). */
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
  // Smart-fill (MIN-260) : mêmes règles que Smart Assign — la fonctionnalité
  // tient lieu d'acteur. Testé AVANT `via_assistant` et compagnie pour la même
  // raison qu'elle : l'écriture porte l'id de l'auteur du ticket, qui n'a rien
  // fait de ces quatre propriétés.
  const viaSmartFill = !viaSmartAssign && !!item.event.via_smart_fill;
  // Automatisation de projet (MIN-147) : le run part sous le compte de l'assigné
  // — c'est de lui que viennent la clé, le quota et la langue — mais PERSONNE
  // n'a cliqué. Sans ce drapeau la timeline écrivait « <assigné> a lancé l'agent
  // Numo », un geste que cette personne n'a pas fait. Acteur à part et non
  // « Numo » : la phrase nomme déjà l'agent lancé, c'est la RÈGLE qui l'a lancé.
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
  // Soumission board (feedback) : l'auteur est un utilisateur final sans
  // identité équipe, mais il n'est pas anonyme pour autant — le board a son
  // email (c'est par lui qu'on le recontacte). C'est donc LUI que la ligne
  // nomme, comme la fiche auteur du panneau ; le board ne tient lieu d'acteur
  // que pour les rares posts sans auteur connu.
  const viaBoard =
    entity === "feedback" &&
    item.event.type === "created" &&
    item.event.field === "board";
  const boardAuthor = viaBoard ? ctx.feedbackAuthor ?? null : null;
  // via_mcp : l'acteur affiché est l'AGENT (nom canonique + logo), pas
  // l'utilisateur — l'action peut venir d'un workflow automatisé.
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
    Exporté depuis MIN-282 : le fil d'une page le monte tel quel. */
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
  /** Seuls les MEMBRES sont lus ici (l'auteur, son visage, les pilules de
      mention) : le type le dit, pour qu'une surface sans objectifs ni
      catégories — le fil d'une page — n'ait pas à fabriquer un décor vide. */
  ctx: Pick<EventContext, "members">;
  currentUserId: string | null;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
  deletesReplies: boolean;
  /** Message d'un fil, pas sa racine : le badge « Public » ne se répète pas à
      chaque ligne — la racine et la teinte de la carte le disent déjà, et cinq
      badges pour une seule idée se lisent comme du bruit. */
  isReply?: boolean;
}) {
  const t = useTranslations("Timeline");
  const tCommon = useTranslations("Common");
  const tAssistant = useTranslations("Assistant");
  const tToolCall = useTranslations("ToolCall");
  const viaNumo = !!comment.via_assistant;
  const viaMcp = !viaNumo && !!comment.via_mcp;
  const author = actorName(ctx.members, comment.author_id, t);
  // Fil public d'un retour (MIN-196). Deux nouveautés dans ce bloc, et une
  // seule règle : ici, dans la vue d'ÉQUIPE, on NOMME le visiteur. C'est
  // exactement l'inverse du board, où il n'est qu'un avatar — et c'est pour ça
  // qu'on lui demande de se connecter avant d'écrire : sans identité, il n'y a
  // personne à modérer. L'avatar, lui, reste semé sur le pseudonyme : le même
  // visage des deux côtés, pour reconnaître d'un coup d'œil sur le board le
  // commentaire qu'on vient de lire ici.
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
  /**
   * Ce qu'on peut faire à ce commentaire, et les deux règles ne se recouvrent
   * pas.
   *
   * SUPPRIMER un commentaire PUBLIC est ouvert à toute l'équipe, quel qu'en soit
   * l'auteur — la règle suit l'endroit où sont les mots, pas la main qui les a
   * tapés. Ils sont sur une page que l'équipe publie en son nom : réserver le
   * retrait à l'auteur laissait un propos abusif en ligne jusqu'à son retour,
   * rendait irrécupérable la réponse d'un collègue parti, et laissait les
   * réponses d'équipe reprises par la migration — sans auteur par construction —
   * supprimables par personne.
   *
   * ÉDITER reste à l'auteur. Réécrire les mots d'un autre sous son nom n'est pas
   * de la modération ; et ceux d'un VISITEUR ne se réécrivent jamais. Corriger
   * une coquille dans sa propre réponse publiée, en revanche, reste permis.
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
        {/* Ce que ce commentaire engage, dit avant de le lire : « Public » veut
            dire qu'il est SUR le board, lisible par tout le monde. L'absence de
            badge est la valeur par défaut de toute l'app — une note d'équipe. */}
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
        {/* UN seul menu, deux règles. Il apparaît dès qu'un geste est possible :
            supprimer (tout commentaire public, ou le sien) ou éditer (le sien
            seulement). Les commentaires de Numo restent en lecture seule tant
            qu'ils sont internes ; publiés, ils se retirent comme le reste — il
            faut bien que quelqu'un puisse dépublier ce qu'un agent a publié. */}
        {(canEdit || canDelete) && !editing && !working && (
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
        // Supprimer un message PUBLIC ne se confirme pas comme une note d'équipe :
        // ce qui disparaît est une page que des gens ont lue, et parfois la
        // réponse qu'on leur avait faite. La phrase doit le dire avant le clic.
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
    Exporté depuis MIN-282 : le fil d'une page répond avec le même geste. */
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
   * Le fil est PUBLIC (MIN-196) : la réponse partira sur le board, sans que
   * personne l'ait choisi ici — une réponse hérite de la visibilité de son fil,
   * c'est le serveur qui le décide et il n'y a rien à basculer.
   *
   * D'où ce drapeau, dont le seul rôle est de le DIRE : sans lui, le geste le
   * plus naturel de l'écran (répondre à quelqu'un) publierait sur une page
   * indexable dans le même costume qu'une note d'équipe.
   */
  threadIsPublic?: boolean;
  /**
   * Le fil accepte des PIÈCES JOINTES (MIN-282).
   *
   * Faux sur une page, et ce n'est pas une simplification : une ressource pend
   * à un ticket, à un objectif ou à un retour (`attachments_parent_ck`), donc un
   * fichier lâché ici partirait en stockage sans jamais trouver de ligne où
   * s'accrocher. Le document, lui, prend déjà les images et les fichiers
   * (MIN-280) — c'est là que le geste a un sens.
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
        // Le même air que le composeur en mode public : ce qui s'écrit ici part
        // au même endroit, ça doit se ressembler.
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
    attachments: ResourceInput[]
  ) => Promise<void>;
  onEditComment: (commentId: string, body: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
}) {
  // La visibilité se lit sur la RACINE : c'est elle dont hérite toute réponse.
  const threadIsPublic = item.comment.visibility === "public";
  return (
    <li
      className={cn(
        "flex flex-col rounded-lg border bg-card",
        // Un fil public se voit d'un coup d'œil dans une liste qui en mélange
        // deux sortes : c'est ce qui distingue une note d'équipe d'une
        // conversation que des gens lisent sur le board.
        threadIsPublic ? "border-brand/30" : "border-border"
      )}
    >
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
  /** Cf. `ReplyComposer` : faux sur une page, où un fichier n'a pas de ligne
      où s'accrocher (MIN-282). */
  allowAttachments?: boolean;
  /** Le libellé du champ vide, quand « Écrire un commentaire… » ne dit pas ce
      qu'on est en train de faire (commenter un PASSAGE, par exemple). */
  placeholder?: string;
  /** Le libellé du bouton d'envoi, même raison. */
  submitLabel?: string;
  autoFocus?: boolean;
  onSubmit: (
    body: string,
    mentionedUserIds: string[],
    attachments: ResourceInput[],
    visibility: CommentVisibility
  ) => Promise<void>;
  /**
   * Le fil d'un retour peut être adressé à deux publics (MIN-196) : on offre
   * alors la bascule. Absente ailleurs — un ticket ou un objectif n'a pas de
   * page publique, et une bascule qui n'a qu'une position est un mensonge.
   *
   * `disabledReason` (board non publié) garde la bascule VISIBLE mais éteinte,
   * avec sa raison : la faire disparaître laisserait croire que les retours ne
   * se répondent pas, alors qu'il manque un réglage à deux écrans d'ici.
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
        // Un commentaire public n'emporte pas de mention : il s'adresse à qui a
        // écrit le retour, pas à un collègue.
        isPublic ? [] : extractMentions(draft, members),
        uploads.inputs,
        visibility
      );
      setDraft("");
      uploads.clear();
      // Retour à « interne » après chaque envoi. Les deux erreurs possibles ne
      // se valent pas : une note d'équipe écrite en interne par mégarde ne
      // coûte rien et se répare, un mot publié par mégarde a déjà été lu.
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
        // Le composeur CHANGE D'AIR quand ce qu'on écrit part sur le board.
        // Une pastille discrète se rate ; la bordure du champ, non — et c'est
        // la seule chose que regarde quelqu'un en train de taper.
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
 * À qui on écrit : à l'équipe, ou au board (MIN-196).
 *
 * Un seul bouton qui bascule, pas deux onglets — il n'y a que deux positions,
 * et celle qui compte est celle qu'on QUITTE. Éteint, il dit « Interne » au
 * gris de tout le reste de l'écran ; allumé, il porte le globe et la couleur
 * de marque, exactement la même que le badge des commentaires publics du fil
 * juste au-dessus : le bouton et son résultat se ressemblent.
 */
function VisibilityToggle({
  visibility,
  onChange,
  disabledReason,
  disabled,
}: {
  visibility: CommentVisibility;
  onChange: (next: CommentVisibility) => void;
  /** Board non publié : le geste n'a nulle part où aboutir, on dit pourquoi. */
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
      {/* `span` porteur : un bouton désactivé n'émet pas les événements de
          survol dont l'infobulle a besoin — et c'est justement désactivé
          qu'elle a le plus à dire. */}
      <TooltipTrigger asChild>
        <span className="flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {disabledReason ?? (isPublic ? t("visibilityPublicHint") : t("visibilityInternalHint"))}
      </TooltipContent>
    </Tooltip>
  );
}
