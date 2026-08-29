"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  IconButton,
  Skeleton,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import {
  AtSign,
  ChevronLeft,
  GitMerge,
  GitPullRequest,
  Inbox,
  Mail,
  MailOpen,
  Megaphone,
  MessageSquare,
  Settings,
  Trash2,
  UserPlus,
} from "lucide-react";
import { EmptyScene } from "@/components/empty-scene";
import {
  AutomationAvatar,
  McpAvatar,
  NumoAvatar,
  SmartAssignAvatar,
} from "@/components/actor-avatars";
import { UserAvatar } from "@/components/user-avatar";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { SidebarNavRail } from "@/components/sidebar-nav-rail";
import { matchesFilter } from "@/components/sidebar-filter-field";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { notificationActor, notificationTitle } from "@/lib/notification-line";
import { useNotifications } from "@/lib/use-notifications";
import { useInvitationResponder } from "@/lib/use-invitations-query";
import {
  notificationLineKey,
  notificationTargetPath,
} from "@/lib/notification-target";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { useScrollFade } from "@/lib/use-scroll-fade";
import type {
  MyInvitation,
  MyNotification,
  NotificationType,
} from "@/lib/types";

const AGENT_TYPES: readonly NotificationType[] = [
  "agent_done",
  "agent_question",
  "agent_failed",
  "routine_done",
  "page_agent_edit",
];

type InboxFilter = "unread" | "all" | "mentions";

const FILTERS: readonly { key: InboxFilter; labelKey: string }[] = [
  { key: "unread", labelKey: "filterUnread" },
  { key: "all", labelKey: "filterAll" },
  { key: "mentions", labelKey: "filterMentions" },
];

type DateGroup = "today" | "yesterday" | "earlier";

const GROUP_KEYS: Record<DateGroup, string> = {
  today: "groupToday",
  yesterday: "groupYesterday",
  earlier: "groupEarlier",
};

function groupOf(at: string): DateGroup {
  const date = new Date(at);
  const now = new Date();
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(date)) / 86_400_000,
  );
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "earlier";
}

/** The actor or event brand shown at the start of every notification row. */
function RowAvatar({
  notification,
  unread,
}: {
  notification: MyNotification;
  unread: boolean;
}) {
  if (notification.from_numo || AGENT_TYPES.includes(notification.type)) {
    return <NumoAvatar className="size-8" iconClassName="size-5" />;
  }
  if (notification.via_automation) {
    return <AutomationAvatar className="size-8" iconClassName="size-4" />;
  }
  if (notification.via_smart_assign) {
    return <SmartAssignAvatar className="size-8" iconClassName="size-4" />;
  }
  if (notification.via_mcp) {
    return (
      <McpAvatar
        agent={notification.api_key_agent}
        className="size-8"
        iconClassName="size-4"
      />
    );
  }
  if (notification.actor_avatar_seed) {
    return (
      <UserAvatar seed={notification.actor_avatar_seed} className="size-8" />
    );
  }

  const Icon =
    notification.type === "assigned"
      ? UserPlus
      : notification.type === "mention" || notification.type === "page_mention"
        ? AtSign
        : notification.type === "feedback_new"
          ? Megaphone
          : notification.type === "pr_merged"
            ? GitMerge
            : notification.type === "pr_reviewed" ||
                notification.type === "pr_opened"
              ? GitPullRequest
              : MessageSquare;
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        unread
          ? "bg-muted text-foreground"
          : "bg-muted/60 text-muted-foreground",
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

function ActionTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const t = useTranslations("Inbox");
  const tCommon = useTranslations("Common");
  const tIssue = useTranslations("Issue");
  const tProjects = useTranslations("Projects");
  const tTimeline = useTranslations("Timeline");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const contentFade = useScrollFade<HTMLDivElement>();
  useAssistantContext({ inbox: true });

  const labels = {
    someone: t("someone"),
    mcpFallback: tTimeline("mcpFallback"),
    somePageFallback: t("somePageFallback"),
    someAgentConversationFallback: t("someAgentConversationFallback"),
    someIssueFallback: t("someIssueFallback", {
      entity: tIssue("entity").toLowerCase(),
    }),
  };

  const {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    markUnread,
    remove,
    clearRead,
  } = useNotifications();
  const {
    invitations,
    busyId: invitationBusyId,
    answer: answerInvitation,
  } = useInvitationResponder();
  const [filter, setFilter] = useState<InboxFilter>("unread");
  const [query, setQuery] = useState("");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [clearReadOpen, setClearReadOpen] = useState(false);

  const titleOf = (notification: MyNotification): string =>
    notificationTitle(notification, labels);

  const sentenceOf = (notification: MyNotification): string => {
    const sentence = t(
      notificationLineKey(notification.type, notification.from_numo),
      { actor: notificationActor(notification, labels) },
    );
    return notification.comment_excerpt
      ? `${sentence}: ${notification.comment_excerpt}`
      : sentence;
  };

  const inviterOf = (invitation: MyInvitation): string =>
    invitation.inviter_name || invitation.inviter_email || t("someone");

  const visible = notifications.filter((notification) => {
    if (filter === "unread" && notification.read_at) return false;
    if (
      filter === "mentions" &&
      notification.type !== "mention" &&
      notification.type !== "page_mention"
    ) {
      return false;
    }
    const reference =
      notification.project_key && notification.issue_number != null
        ? `${notification.project_key}-${notification.issue_number}`
        : notification.pull_request_number != null
          ? `#${notification.pull_request_number}`
          : null;
    return matchesFilter(query, [
      reference,
      titleOf(notification),
      sentenceOf(notification),
      notification.project_key,
    ]);
  });

  const visibleInvitations = invitations.filter((invitation) =>
    matchesFilter(query, [
      invitation.project_name,
      invitation.project_key,
      inviterOf(invitation),
    ]),
  );
  const showInvitations =
    filter !== "mentions" && visibleInvitations.length > 0;

  const groups = useMemo(() => {
    const buckets = new Map<DateGroup, MyNotification[]>();
    for (const notification of visible) {
      const group = groupOf(notification.created_at);
      const items = buckets.get(group);
      if (items) items.push(notification);
      else buckets.set(group, [notification]);
    }
    return [...buckets.entries()];
  }, [visible]);

  const readCount = notifications.length - unreadCount;
  const pendingCount = unreadCount + invitations.length;
  const unreadMentionCount = notifications.filter(
    (notification) =>
      !notification.read_at &&
      (notification.type === "mention" || notification.type === "page_mention"),
  ).length;
  const filterCounts: Record<InboxFilter, number> = {
    unread: pendingCount,
    all: pendingCount,
    mentions: unreadMentionCount,
  };
  const act = (promise: Promise<void>) =>
    void promise.catch((error) => toast.error((error as Error).message));

  const open = (notification: MyNotification) => {
    if (!notification.read_at) act(markRead([notification.id]));
    const path = notificationTargetPath(notification);
    if (path) router.push(path);
  };

  const emptyTitle = query.trim()
    ? tCommon("noFilterMatch")
    : filter === "mentions"
      ? t("emptyMentions")
      : filter === "all"
        ? t("emptyAll")
        : t("emptyTitle");

  return (
    <div className="flex h-full min-h-0">
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={mobileDetail}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", {
            count: notifications.length + invitations.length,
          }),
          clearLabel: tCommon("clearFilter"),
        }}
      >
        <SidebarNavRail
          label={t("title")}
          items={FILTERS.map(({ key, labelKey }) => ({
            value: key,
            label: t(labelKey as Parameters<typeof t>[0]),
            count: filterCounts[key] > 0 ? filterCounts[key] : undefined,
            countLabel:
              filterCounts[key] > 0
                ? t("filterUnreadCount", { count: filterCounts[key] })
                : undefined,
          }))}
          value={filter}
          onValueChange={(value) => {
            setFilter(value as InboxFilter);
            setMobileDetail(true);
          }}
        />
      </SecondarySidebar>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        <header className="flex h-[60px] shrink-0 items-center justify-end gap-4 px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("title")}
            className="mr-auto md:hidden"
            onClick={() => setMobileDetail(false)}
          >
            <ChevronLeft />
          </Button>
          <div className="flex shrink-0 items-center gap-2">
            {readCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setClearReadOpen(true)}
              >
                {t("clearRead")}
              </Button>
            )}
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => act(markAllRead())}
              >
                {t("markAllRead")}
              </Button>
            )}
            <ActionTooltip label={t("settings")}>
              <IconButton size="sm" aria-label={t("settings")} asChild>
                <Link href="/settings?tab=inbox">
                  <Settings className="size-4" />
                </Link>
              </IconButton>
            </ActionTooltip>
          </div>
        </header>

        <div
          ref={contentFade.ref}
          {...contentFade.scrollProps}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-8">
            {showInvitations && (
              <section>
                <h2 className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                  {t("groupInvitations")}
                </h2>
                <ul
                  data-inbox-invitations
                  className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card"
                >
                  {visibleInvitations.map((invitation) => {
                    const busy = invitationBusyId === invitation.id;
                    return (
                      <li
                        key={invitation.id}
                        className="relative flex items-center gap-3 px-4 py-3"
                      >
                        <span className="relative shrink-0">
                          <UserAvatar
                            seed={invitation.inviter_avatar_seed}
                            className="size-8"
                          />
                          <span
                            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-blue-500 ring-2 ring-card"
                            aria-hidden
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {invitation.project_name}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {t("lineInvitation", {
                              actor: inviterOf(invitation),
                            })}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              void answerInvitation(invitation.id, "reject")
                            }
                          >
                            {tProjects("reject")}
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void answerInvitation(invitation.id, "accept")
                            }
                          >
                            {busy && <Spinner />}
                            {tProjects("join")}
                          </Button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {loading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              showInvitations ? null : (
                <EmptyScene
                  icon={query.trim() ? AtSign : Inbox}
                  title={emptyTitle}
                />
              )
            ) : (
              groups.map(([group, items], index) => (
                <section
                  key={group}
                  className={cn(
                    index > 0 || showInvitations ? "mt-6" : undefined,
                  )}
                >
                  <h2 className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                    {t(GROUP_KEYS[group] as Parameters<typeof t>[0])}
                  </h2>
                  <ul
                    data-inbox-list
                    className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card"
                  >
                    {items.map((notification) => {
                      const unread = !notification.read_at;
                      const fullDate = format.dateTime(
                        new Date(notification.created_at),
                        {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      );
                      return (
                        <li key={notification.id} className="group relative">
                          <button
                            type="button"
                            onClick={() => open(notification)}
                            className={cn(
                              "relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                              "hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                            )}
                          >
                            <span className="relative shrink-0">
                              <RowAvatar
                                notification={notification}
                                unread={unread}
                              />
                              {unread && (
                                <span
                                  className={cn(
                                    "absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-card",
                                    notification.type === "agent_question"
                                      ? "bg-yellow-500"
                                      : "bg-blue-500",
                                  )}
                                  aria-hidden
                                />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2">
                                {notification.issue_id &&
                                  notification.project_key &&
                                  notification.issue_number != null && (
                                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                      {notification.project_key}-
                                      {notification.issue_number}
                                    </span>
                                  )}
                                {notification.pull_request_id &&
                                  notification.pull_request_number != null && (
                                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                      #{notification.pull_request_number}
                                    </span>
                                  )}
                                <span
                                  className={cn(
                                    "truncate text-sm",
                                    unread
                                      ? "font-medium text-foreground"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {titleOf(notification)}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {sentenceOf(notification)}
                              </span>
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground transition-opacity group-hover:opacity-0">
                                  {format.relativeTime(
                                    new Date(notification.created_at),
                                    now,
                                  )}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {fullDate}
                              </TooltipContent>
                            </Tooltip>
                          </button>
                          <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            {unread ? (
                              <ActionTooltip label={t("markOneRead")}>
                                <IconButton
                                  size="sm"
                                  aria-label={t("markOneRead")}
                                  onClick={() =>
                                    act(markRead([notification.id]))
                                  }
                                >
                                  <MailOpen className="size-4" />
                                </IconButton>
                              </ActionTooltip>
                            ) : (
                              <ActionTooltip label={t("markUnread")}>
                                <IconButton
                                  size="sm"
                                  aria-label={t("markUnread")}
                                  onClick={() =>
                                    act(markUnread([notification.id]))
                                  }
                                >
                                  <Mail className="size-4" />
                                </IconButton>
                              </ActionTooltip>
                            )}
                            <ActionTooltip label={t("delete")}>
                              <IconButton
                                size="sm"
                                aria-label={t("delete")}
                                onClick={() => act(remove([notification.id]))}
                              >
                                <Trash2 className="size-4" />
                              </IconButton>
                            </ActionTooltip>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={clearReadOpen} onOpenChange={setClearReadOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clearReadConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("clearReadConfirmDescription", { count: readCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setClearReadOpen(false);
                act(clearRead());
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
