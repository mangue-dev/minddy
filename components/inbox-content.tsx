"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Delete02Icon, InboxIcon, MailOpen01Icon, MoreHorizontalIcon, Settings01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppRouter } from "@/lib/use-app-router";
import { useTranslations } from "next-intl";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
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
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SearchSelect } from "@/components/search-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssueActionsMenu } from "@/components/issue-context-menu";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { InboxRowsSkeleton } from "@/components/inbox-skeleton";
import { InboxInvitationRow, InboxNotificationRow } from "@/components/inbox-row";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EmptyScene } from "@/components/empty-scene";
import { useNotifications } from "@/lib/use-notifications";
import { useInvitationResponder } from "@/lib/use-invitations-query";
import { notificationTargetPath } from "@/lib/notification-target";
import { useScrollFade } from "@/lib/use-scroll-fade";
import type { MyNotification } from "@/lib/types";

type InboxFilter = "unread" | "all" | "mentions";

const FILTERS: readonly { key: InboxFilter; labelKey: string }[] = [
  { key: "unread", labelKey: "filterUnread" },
  { key: "all", labelKey: "filterAll" },
  { key: "mentions", labelKey: "filterMentions" },
];

/** A notification a launcher asked the inbox to show (MIN-846). A new `seq`
 *  is a new request, even for the same row. */
export interface InboxFocus {
  id: string;
  seq: number;
}

/** How long a targeted row keeps the pulse class: the `page-block-pulse`
 *  animation (app/globals.css) plus a margin, like a page block's flash. */
const ROW_PULSE_MS = 1_700;

/** The tab that lists a notification: Unread while it is unread, All after. */
export function inboxFilterFor(notification: Pick<MyNotification, "read_at">): InboxFilter {
  return notification.read_at ? "all" : "unread";
}

export default function InboxContent({
  onNavigate,
  focus = null,
}: {
  onNavigate: () => void;
  focus?: InboxFocus | null;
}) {
  const router = useAppRouter();
  const t = useTranslations("Inbox");
  const tCommon = useTranslations("Common");
  const mobile = useMobileLayout() === true;
  const contentFade = useScrollFade<HTMLDivElement>();

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
  const [clearReadOpen, setClearReadOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // A targeted launch (the command palette, MIN-846): switch to the tab that
  // lists the row, then scroll to it and pulse it like a page block reached
  // by its link. Each request is handled once — a realtime refresh of the
  // list must not pulse it again — and waits for the list to hold the row.
  const [pulse, setPulse] = useState<InboxFocus | null>(null);
  const handledFocus = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fadeRef = contentFade.ref;
  const setListRef = useCallback((element: HTMLDivElement | null) => {
    listRef.current = element;
    fadeRef(element);
  }, [fadeRef]);
  useEffect(() => {
    if (!focus || handledFocus.current === focus.seq) return;
    const target = notifications.find((notification) => notification.id === focus.id);
    if (!target) return;
    handledFocus.current = focus.seq;
    setFilter(inboxFilterFor(target));
    setPulse(focus);
  }, [focus, notifications]);
  useEffect(() => {
    if (!pulse) return;
    const row = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-notification-id]") ?? [],
    ).find((element) => element.dataset.notificationId === pulse.id);
    row?.scrollIntoView({ block: "nearest" });
    const timer = setTimeout(() => setPulse(null), ROW_PULSE_MS);
    return () => clearTimeout(timer);
  }, [pulse]);

  const visible = notifications.filter((notification) => {
    if (filter === "unread" && notification.read_at) return false;
    if (
      filter === "mentions" &&
      notification.type !== "mention" &&
      notification.type !== "page_mention"
    ) {
      return false;
    }
    return true;
  });

  const showInvitations = filter !== "mentions" && invitations.length > 0;

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
    if (path) {
      onNavigate();
      router.push(path);
    }
  };

  const emptyTitle = filter === "mentions"
      ? t("emptyMentions")
      : filter === "all"
        ? t("emptyAll")
        : t("emptyTitle");

  const filterLabel = (key: InboxFilter) =>
    t((FILTERS.find((item) => item.key === key)?.labelKey ?? "filterUnread") as Parameters<typeof t>[0]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The views and the actions menu share one bar. A phone picks the view
          from a picker (MIN-975); a desktop shows the views as tabs, the
          same tabs as the routines home. */}
      <div
        data-inbox-sheet-bar
        className={cn("flex shrink-0 items-center gap-2", mobile ? "px-3 pb-2" : "px-3 pt-3 pb-1")}
      >
        {mobile ? (
          <div className="min-w-0 flex-1">
            <SearchSelect
              value={filter}
              onChange={(next) => { if (next) setFilter(next as InboxFilter); }}
              options={FILTERS.map(({ key }) => ({
                value: key,
                label: filterLabel(key),
                labelNode: (
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate">{filterLabel(key)}</span>
                    {filterCounts[key] > 0 && (
                      <span
                        className="rounded-full bg-muted px-1.5 text-xs tabular-nums"
                        aria-label={t("filterUnreadCount", { count: filterCounts[key] })}
                      >
                        {filterCounts[key]}
                      </span>
                    )}
                  </span>
                ),
              }))}
              trigger={
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11 min-w-0 max-w-full justify-start gap-1.5 px-4 text-base"
                >
                  <span className="truncate">{filterLabel(filter)}</span>
                  <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0" />
                </Button>
              }
            />
          </div>
        ) : (
          <Tabs value={filter} onValueChange={(next) => setFilter(next as InboxFilter)} className="min-w-0 flex-1">
            <TabsList variant="line" aria-label={t("title")} className="justify-start">
              {FILTERS.map(({ key }) => (
                <TabsTrigger key={key} value={key} className="gap-1.5">
                  {filterLabel(key)}
                  {filterCounts[key] > 0 && (
                    <span
                      className="rounded-full bg-muted px-1.5 text-xs tabular-nums"
                      aria-label={t("filterUnreadCount", { count: filterCounts[key] })}
                    >
                      {filterCounts[key]}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <IssueActionsMenu
          tooltip={tCommon("moreActions")}
          trigger={
            <IconButton size={mobile ? undefined : "sm"} aria-label={tCommon("moreActions")}>
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </IconButton>
          }
          actions={[
            { id: "mark-all-read", label: t("markAllRead"), icon: <HugeiconsIcon icon={MailOpen01Icon} className="size-4" />, disabled: unreadCount === 0, onSelect: () => act(markAllRead()) },
            { id: "clear-read", label: t("clearRead"), icon: <HugeiconsIcon icon={Delete02Icon} className="size-4" />, disabled: readCount === 0, transfersFocus: true, onSelect: () => setClearReadOpen(true) },
            { id: "settings", label: t("settings"), icon: <HugeiconsIcon icon={Settings01Icon} className="size-4" />, separatorBefore: true, onSelect: () => { onNavigate(); router.push("/settings?tab=inbox"); } },
          ]}
        />
      </div>
      <div
        ref={setListRef}
        {...contentFade.scrollProps}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <ul data-inbox-list className="w-full divide-y divide-border/60 py-1">
          {showInvitations && invitations.map((invitation) => (
            <InboxInvitationRow
              key={invitation.id}
              invitation={invitation}
              busy={invitationBusyId === invitation.id}
              onAnswer={(answer) => void answerInvitation(invitation.id, answer)}
            />
          ))}
          {!loading && visible.map((notification) => (
            <InboxNotificationRow
              // A new key per request restarts the pulse animation on a row
              // that is still pulsing.
              key={pulse?.id === notification.id ? `${notification.id}:${pulse.seq}` : notification.id}
              notification={notification}
              pulse={pulse?.id === notification.id}
              swipeable={mobile}
              actions={{
                onOpen: () => open(notification),
                onToggleRead: () => act(notification.read_at
                  ? markUnread([notification.id])
                  : markRead([notification.id])),
                onDelete: () => setDeleteTargetId(notification.id),
              }}
            />
          ))}
        </ul>
        {loading ? (
          <InboxRowsSkeleton />
        ) : visible.length === 0 && !showInvitations ? (
          <EmptyScene icon={InboxIcon} title={emptyTitle} />
        ) : null}
      </div>
      <ConfirmDeleteDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmDescription")}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => {
          if (deleteTargetId) act(remove([deleteTargetId]));
        }}
        // The inbox opens in a popover, which floats above dialogs.
        overFloatingSurface
      />
      <AlertDialog open={clearReadOpen} onOpenChange={setClearReadOpen}>
        <AlertDialogContent overFloatingSurface>
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
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
