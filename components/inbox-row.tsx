"use client";

// One inbox row (MIN-975): who acted, what happened to which record, and the
// context that helps decide whether to open it. The record is a typed mention
// pill inside the sentence; the context line appears only when it adds
// something (lib/notification-line.ts decides which).

import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  GithubIcon,
  GitlabIcon,
  Mail01Icon,
  MailOpen01Icon,
  Delete02Icon,
  Megaphone01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import {
  AutomationAvatar,
  McpAvatar,
  NumoAvatar,
  SmartAssignAvatar,
} from "@/components/actor-avatars";
import { UserAvatar } from "@/components/user-avatar";
import { TypedMentionChip } from "@/components/typed-mention-chip";
import { MentionLinksProvider, type MentionLinks } from "@/components/mention-links";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTimeAgo } from "@/lib/use-live-now";
import { plainMarkdownParts } from "@/lib/plain-markdown";
import { mentionTargetKey, type MentionLinkType, type MentionMeta } from "@/lib/mention-link";
import {
  notificationActor,
  notificationContext,
  notificationOwnTitle,
  notificationTargetMention,
  notificationTitleKey,
  notificationTitleValues,
  splitAtTarget,
  type NotificationActor,
  type NotificationLabels,
  type NotificationTargetMention,
} from "@/lib/notification-line";
import { useNotificationLabels } from "@/lib/use-notification-text";
import { cn } from "@/lib/utils";
import type { MyInvitation, MyNotification } from "@/lib/types";
import type { IssueStatus } from "@/lib/issue-constants";

/** Avatars are neutral: an actor's figure, never the accent color. */
const NEUTRAL_DISC = "size-9 bg-muted text-foreground";

/** The label the server relabeled for this reader into a stored mention,
    which `mention-access` writes as `unavailable` when it is not theirs. */
const UNAVAILABLE = "unavailable";

function ActorAvatar({
  actor,
  notification,
}: {
  actor: NotificationActor;
  notification: MyNotification;
}) {
  switch (actor.kind) {
    case "numo":
      return <NumoAvatar className={NEUTRAL_DISC} iconClassName="size-5" />;
    case "smart_assign":
      return <SmartAssignAvatar className={NEUTRAL_DISC} iconClassName="size-[18px]" />;
    case "automation":
      return <AutomationAvatar className={NEUTRAL_DISC} iconClassName="size-[18px]" />;
    case "mcp":
      return <McpAvatar agent={notification.api_key_agent} className={NEUTRAL_DISC} iconClassName="size-4" />;
    case "feedback":
      return <IconDisc icon={Megaphone01Icon} />;
    case "forge":
      return <IconDisc icon={notification.pull_request_provider === "gitlab" ? GitlabIcon : GithubIcon} />;
    case "person":
      return notification.actor_avatar_seed
        ? <UserAvatar seed={notification.actor_avatar_seed} className="size-9" />
        : <IconDisc icon={UserIcon} />;
  }
}

function IconDisc({ icon }: { icon: typeof UserIcon }) {
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full", NEUTRAL_DISC)}>
      <HugeiconsIcon icon={icon} className="size-[18px]" />
    </span>
  );
}

/**
 * The mention surface of one row: labels the row already knows, the issue's
 * status, and no destination — a pill inside a row opens the row's target.
 */
function rowLinks(
  labels: ReadonlyMap<string, string>,
  issueStatus: IssueStatus | null,
): MentionLinks {
  return {
    href: () => null,
    navigate: () => {},
    issueStatus: () => issueStatus,
    label: (type, id, meta) => labels.get(mentionTargetKey(type as MentionLinkType, id, meta)) ?? null,
  };
}

/** Text whose typed mentions are drawn as pills (a Numo note). */
function MentionedText({ markdown }: { markdown: string }) {
  const parts = useMemo(() => plainMarkdownParts(markdown), [markdown]);
  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string"
          ? <Fragment key={index}>{part}</Fragment>
          : <TypedMentionChip key={index} type={part.type} id={part.id} meta={part.meta as MentionMeta | undefined} />)}
    </>
  );
}

/** The labels a row's pills may show without asking the server. */
function knownLabels(
  target: NotificationTargetMention | null,
  ...texts: Array<string | null>
): Map<string, string> {
  const labels = new Map<string, string>();
  if (target?.label) labels.set(mentionTargetKey(target.type, target.id), target.label);
  for (const text of texts) {
    for (const part of text ? plainMarkdownParts(text) : []) {
      if (typeof part !== "string" && part.label && part.label !== UNAVAILABLE) {
        labels.set(mentionTargetKey(part.type, part.id, part.meta), part.label);
      }
    }
  }
  return labels;
}

/** A sentence with a target slot, the target drawn as its pill. */
export function TargetSentence({
  sentence,
  token,
  target,
}: {
  sentence: string;
  token: string;
  target: NotificationTargetMention | null;
}) {
  const pieces = splitAtTarget(sentence, token);
  return (
    <>
      {pieces.map((piece, index) => (
        <Fragment key={index}>
          {piece}
          {index < pieces.length - 1 && target && (
            <TypedMentionChip type={target.type} id={target.id} />
          )}
        </Fragment>
      ))}
    </>
  );
}

/** Stands in for the target in a translated sentence, then split on. */
const TARGET_TOKEN = "⁣target⁣";

function RowTime({ at }: { at: string }) {
  const format = useFormatter();
  const timeAgo = useTimeAgo();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{timeAgo(at)}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {format.dateTime(new Date(at), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </TooltipContent>
    </Tooltip>
  );
}

function ActionTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/** The three lines of a row, shared by notifications and invitations. */
function RowBody({
  avatar,
  unreadDot,
  name,
  time,
  title,
  context,
  contextLines = 1,
  dimmed,
  keepTime = false,
  children,
}: {
  avatar: ReactNode;
  /** `null` = read; otherwise the dot's color class. */
  unreadDot: string | null;
  name: string;
  time: string;
  title: ReactNode;
  context: ReactNode | null;
  contextLines?: 1 | 2;
  dimmed: boolean;
  /** A swiped row has no hover buttons to make room for: the time stays. */
  keepTime?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <span className="relative shrink-0">
        {avatar}
        {unreadDot && (
          <span aria-hidden className={cn("absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-card", unreadDot)} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", dimmed ? "text-muted-foreground" : "text-foreground")}>
            {name}
          </span>
          <span className={cn(!keepTime && "transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 touch:opacity-100!")}>
            <RowTime at={time} />
          </span>
        </span>
        <span className={cn("block text-sm leading-6", dimmed ? "text-muted-foreground" : "text-foreground")}>
          {title}
        </span>
        {context && (
          <span className={cn("block text-sm text-muted-foreground", contextLines === 1 ? "truncate" : "line-clamp-2")}>
            {context}
          </span>
        )}
        {children}
      </span>
    </>
  );
}

/** Row travel, in px, past which a released swipe acts. */
export const SWIPE_ACTION_DISTANCE = 80;
/** Release speed, in px/s, that acts whatever the distance. */
const SWIPE_ACTION_VELOCITY = 600;
/** A flick still has to move the row this far, so a tremor does nothing. */
const SWIPE_MIN_FLICK = 24;

/** Which action a released swipe triggers, or `null` when it springs back. */
export function swipeAction(travel: number, velocity: number): "toggle-read" | "delete" | null {
  const far = Math.abs(travel) >= SWIPE_ACTION_DISTANCE;
  const flick = Math.abs(velocity) >= SWIPE_ACTION_VELOCITY && Math.abs(travel) >= SWIPE_MIN_FLICK
    && Math.sign(velocity) === Math.sign(travel);
  if (!far && !flick) return null;
  return travel > 0 ? "toggle-read" : "delete";
}

/**
 * A phone row's actions, as in a mail app: swiped right it toggles read,
 * swiped left it asks to delete (MIN-975). The row springs back either way;
 * a deletion still goes through its confirmation.
 */
function SwipeActions({
  unread,
  onToggleRead,
  onDelete,
  children,
}: {
  unread: boolean;
  onToggleRead: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const x = useMotionValue(0);
  const readOpacity = useTransform(x, [0, SWIPE_ACTION_DISTANCE], [0, 1]);
  const readScale = useTransform(x, [0, SWIPE_ACTION_DISTANCE], [0.6, 1]);
  const deleteOpacity = useTransform(x, [-SWIPE_ACTION_DISTANCE, 0], [1, 0]);
  const deleteScale = useTransform(x, [-SWIPE_ACTION_DISTANCE, 0], [1, 0.6]);
  // A swipe ends with a click on the row under the finger: it must not open it.
  const dragged = useRef(false);

  const end = (_event: unknown, info: PanInfo) => {
    const action = swipeAction(x.get(), info.velocity.x);
    if (action === "toggle-read") onToggleRead();
    if (action === "delete") onDelete();
  };

  return (
    <>
      <div aria-hidden className="absolute inset-0 flex">
        <motion.div style={{ opacity: readOpacity }} className="flex flex-1 items-center bg-blue-500 pl-6 text-white">
          <motion.span style={{ scale: readScale }}>
            <HugeiconsIcon icon={unread ? MailOpen01Icon : Mail01Icon} className="size-5" />
          </motion.span>
        </motion.div>
        <motion.div style={{ opacity: deleteOpacity }} className="absolute inset-0 flex items-center justify-end bg-destructive-button pr-6 text-destructive-button-foreground">
          <motion.span style={{ scale: deleteScale }}>
            <HugeiconsIcon icon={Delete02Icon} className="size-5" />
          </motion.span>
        </motion.div>
      </div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        dragSnapToOrigin
        style={{ x, touchAction: "pan-y" }}
        onPointerDown={() => { dragged.current = false; }}
        onDragStart={() => { dragged.current = true; }}
        onDragEnd={end}
        onClickCapture={(event) => {
          if (!dragged.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        className="relative bg-card"
      >
        {children}
      </motion.div>
    </>
  );
}

export interface InboxRowActions {
  onOpen: () => void;
  onToggleRead: () => void;
  onDelete: () => void;
}

/** One notification row. `labels` lets the design sheet pass its own. */
export function InboxNotificationRow({
  notification,
  pulse = false,
  actions,
  labels: labelsOverride,
  swipeable = false,
}: {
  notification: MyNotification;
  pulse?: boolean;
  actions: InboxRowActions;
  labels?: NotificationLabels;
  /** On a phone, the actions are swipes instead of buttons over the time. */
  swipeable?: boolean;
}) {
  const t = useTranslations("Inbox");
  const tCommon = useTranslations("Common");
  const defaultLabels = useNotificationLabels();
  const labels = labelsOverride ?? defaultLabels;
  const unread = !notification.read_at;
  const actor = notificationActor(notification, labels);
  const target = notificationTargetMention(notification, labels);
  const ownTitle = notificationOwnTitle(notification);
  const context = notificationContext(notification);
  const isNote = notification.type === "numo_message";
  const links = useMemo(() => rowLinks(
    knownLabels(notificationTargetMention(notification, labels), notificationOwnTitle(notification),
      notification.type === "numo_message" ? notificationContext(notification) : null),
    notification.issue_status,
  ), [notification, labels]);

  const title = ownTitle !== null
    ? <MentionedText markdown={ownTitle} />
    : (
      <TargetSentence
        sentence={t(notificationTitleKey(notification), notificationTitleValues(notification, TARGET_TOKEN))}
        token={TARGET_TOKEN}
        target={target}
      />
    );

  const row = (
    <MentionLinksProvider value={links}>
      <button
        type="button"
        data-sidebar-filter-result
        onClick={actions.onOpen}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors focus-visible:outline-none app-mobile:px-3"
      >
        <RowBody
          avatar={<ActorAvatar actor={actor} notification={notification} />}
          unreadDot={unread ? (notification.type === "agent_question" ? "bg-yellow-500" : "bg-blue-500") : null}
          name={actor.name}
          time={notification.created_at}
          title={title}
          context={context ? (isNote ? <MentionedText markdown={context} /> : context) : null}
          contextLines={isNote ? 2 : 1}
          dimmed={!unread}
          keepTime={swipeable}
        />
      </button>
    </MentionLinksProvider>
  );

  return (
    <li
      data-notification-id={notification.id}
      className={cn(
        "group relative",
        swipeable ? "overflow-hidden" : "hover:bg-muted/50 focus-within:bg-muted/50",
        pulse && "inbox-row-target",
      )}
    >
      {swipeable
        ? <SwipeActions unread={unread} onToggleRead={actions.onToggleRead} onDelete={actions.onDelete}>{row}</SwipeActions>
        : row}
      {/* Swiped rows keep these for assistive technologies, which do not swipe. */}
      <span
        className={cn(
          "absolute right-3 top-2.5 flex items-center",
          swipeable
            ? "sr-only"
            : "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 touch:hidden",
        )}
      >
        <ActionTooltip label={unread ? t("markOneRead") : t("markUnread")}>
          <IconButton size="sm" aria-label={unread ? t("markOneRead") : t("markUnread")} onClick={actions.onToggleRead}>
            <HugeiconsIcon icon={unread ? MailOpen01Icon : Mail01Icon} className="size-4" />
          </IconButton>
        </ActionTooltip>
        <ActionTooltip label={tCommon("delete")}>
          <IconButton size="sm" aria-label={tCommon("delete")} onClick={actions.onDelete}>
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          </IconButton>
        </ActionTooltip>
      </span>
    </li>
  );
}

type InvitationAnswer = "accept" | "reject";

/**
 * A pending invitation: the same row, answered in place. Each answer asks
 * first, as signing out does (MIN-975): a popover by the buttons on a
 * computer, an alert dialog with its buttons stacked on a phone.
 */
export function InboxInvitationRow({
  invitation,
  busy,
  onAnswer,
}: {
  invitation: MyInvitation;
  busy: boolean;
  onAnswer: (answer: InvitationAnswer) => void;
}) {
  const t = useTranslations("Inbox");
  const tProjects = useTranslations("Projects");
  const tCommon = useTranslations("Common");
  const mobile = useMobileLayout() === true;
  const [confirming, setConfirming] = useState<InvitationAnswer | null>(null);
  // The answer stays on screen while the confirmation closes.
  const [shown, setShown] = useState<InvitationAnswer>("accept");
  // The reader is not a member yet: the server would not name the project,
  // so the pill takes the name the invitation carries.
  const target = useMemo<NotificationTargetMention>(() => ({
    type: "project",
    id: invitation.project_id,
    label: invitation.project_name,
  }), [invitation.project_id, invitation.project_name]);
  const links = useMemo(() => rowLinks(knownLabels(target), null), [target]);
  const inviter = invitation.inviter_name || invitation.inviter_email || t("someone");

  const ask = (answer: InvitationAnswer) => {
    setShown(answer);
    setConfirming(answer);
  };
  const confirm = () => {
    setConfirming(null);
    onAnswer(shown);
  };
  const setOpen = (open: boolean) => { if (!open) setConfirming(null); };
  const title = shown === "accept"
    ? t("joinConfirmTitle", { project: invitation.project_name })
    : t("rejectConfirmTitle", { project: invitation.project_name });
  const description = shown === "accept"
    ? t("joinConfirmDescription")
    : t("rejectConfirmDescription", { actor: inviter });
  const confirmLabel = shown === "accept" ? tProjects("join") : tProjects("reject");
  const confirmVariant = shown === "accept" ? "default" : "destructive";

  const buttons = (
    <span className="mt-2 flex gap-2">
      <Button size="sm" variant="outline" disabled={busy} aria-haspopup="dialog" onClick={() => ask("reject")}>
        {tProjects("reject")}
      </Button>
      <Button size="sm" disabled={busy} aria-haspopup="dialog" onClick={() => ask("accept")}>
        {busy && <Spinner />}
        {tProjects("join")}
      </Button>
    </span>
  );

  return (
    <li className="relative flex items-start gap-3 px-4 py-3.5 app-mobile:px-3">
      <MentionLinksProvider value={links}>
        <RowBody
          avatar={invitation.inviter_avatar_seed
            ? <UserAvatar seed={invitation.inviter_avatar_seed} className="size-9" />
            : <IconDisc icon={UserIcon} />}
          unreadDot="bg-blue-500"
          name={inviter}
          time={invitation.created_at}
          title={<TargetSentence sentence={t("titleInvitation", { target: TARGET_TOKEN })} token={TARGET_TOKEN} target={target} />}
          context={null}
          dimmed={false}
        >
          {mobile ? (
            <>
              {buttons}
              <AlertDialog open={confirming !== null} onOpenChange={setOpen}>
                <AlertDialogContent overFloatingSurface>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                    <AlertDialogAction variant={confirmVariant} onClick={confirm}>{confirmLabel}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <Popover open={confirming !== null} onOpenChange={setOpen}>
              <PopoverAnchor asChild>{buttons}</PopoverAnchor>
              <PopoverContent role="dialog" side="bottom" align="start" sideOffset={8} className="w-72 gap-3 rounded-xl p-3">
                <PopoverHeader>
                  <PopoverTitle>{title}</PopoverTitle>
                  <PopoverDescription>{description}</PopoverDescription>
                </PopoverHeader>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(null)}>
                    {tCommon("cancel")}
                  </Button>
                  <Button type="button" variant={confirmVariant} size="sm" onClick={confirm}>
                    {confirmLabel}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </RowBody>
      </MentionLinksProvider>
    </li>
  );
}
