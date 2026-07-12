"use client";

import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { Button, Skeleton, cn } from "mangue-ui";
import { Inbox, UserPlus, AtSign, MessageSquare } from "lucide-react";
import { useNotifications } from "@/lib/use-notifications";
import type { MyNotification, NotificationType } from "@/lib/types";

const ICONS: Record<NotificationType, typeof Inbox> = {
  assigned: UserPlus,
  mention: AtSign,
  comment: MessageSquare,
};

const VERB_KEYS: Record<NotificationType, string> = {
  assigned: "verbAssigned",
  mention: "verbMention",
  comment: "verbComment",
};

export default function InboxPage() {
  const router = useRouter();
  const t = useTranslations("Inbox");
  const tIssue = useTranslations("Issue");
  const format = useFormatter();
  const { notifications, unreadCount, loading, markRead, markAllRead } =
    useNotifications();

  const issueRef = (n: MyNotification): string => {
    if (n.project_key && n.issue_number != null) {
      return `${n.project_key}-${n.issue_number}`;
    }
    return t("someIssueFallback", { entity: tIssue("entity").toLowerCase() });
  };

  const fmt = (at: string): string =>
    format.dateTime(new Date(at), {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const open = (n: MyNotification) => {
    if (!n.read_at) void markRead([n.id]);
    if (n.project_id && n.objective_id) {
      router.push(`/projects/${n.project_id}/objectives?open=${n.objective_id}`);
    } else if (n.project_id && n.issue_id) {
      router.push(`/projects/${n.project_id}?issue=${n.issue_id}`);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => void markAllRead()}>
            {t("markAllRead")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Inbox className="size-6" />
          </div>
          <p className="text-sm text-muted-foreground">{t("emptyMessage")}</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {notifications.map((n) => {
            const Icon = ICONS[n.type];
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                  !n.read_at && "bg-muted/30"
                )}
              >
                {!n.read_at ? (
                  <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                ) : (
                  <span className="size-2 shrink-0" aria-hidden />
                )}
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-medium">{n.actor_name ?? t("someone")}</span>{" "}
                    {t(VERB_KEYS[n.type] as Parameters<typeof t>[0])}{" "}
                    {n.objective_id ? (
                      <span className="text-muted-foreground">{n.objective_name ?? ""}</span>
                    ) : (
                      <>
                        <span className="font-mono text-xs text-muted-foreground">
                          {issueRef(n)}
                        </span>
                        {n.issue_title && (
                          <span className="text-muted-foreground"> — {n.issue_title}</span>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {fmt(n.created_at)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
