"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter, useNow } from "next-intl";
import { Button, IconButton, Skeleton, Spinner, cn, toast } from "mangue-ui";
import {
  Inbox,
  UserPlus,
  AtSign,
  MessageSquare,
  Megaphone,
  GitPullRequest,
  GitMerge,
  Mail,
  MailOpen,
  Settings,
  Trash2,
} from "lucide-react";
import { EmptyScene } from "@/components/empty-scene";
import {
  AutomationAvatar,
  McpAvatar,
  NumoAvatar,
  SmartAssignAvatar,
} from "@/components/actor-avatars";
import { UserAvatar } from "@/components/user-avatar";
import {
  notificationActor,
  notificationTitle,
} from "@/lib/notification-line";
import { useNotifications } from "@/lib/use-notifications";
import { useInvitationResponder } from "@/lib/use-invitations-query";
import {
  notificationTargetPath,
  NOTIFICATION_LINE_KEYS,
} from "@/lib/notification-target";
import type { MyInvitation, MyNotification, NotificationType } from "@/lib/types";

const AGENT_TYPES: readonly NotificationType[] = [
  "agent_done",
  "agent_question",
  "agent_failed",
  // A routine is Numo running on his own: his face, like a run.
  "routine_done",
  // An agent entry in a page (MIN-278): the line has NO actor
  // human - this is precisely what she announces -, and without her face here she
  // would fall back on the comment bubble of the fallback.
  "page_agent_edit",
];

type InboxFilter = "all" | "unread" | "mentions";

const FILTERS: readonly { key: InboxFilter; labelKey: string }[] = [
  { key: "all", labelKey: "filterAll" },
  { key: "unread", labelKey: "filterUnread" },
  { key: "mentions", labelKey: "filterMentions" },
];

type DateGroup = "today" | "yesterday" | "earlier";

const GROUP_KEYS: Record<DateGroup, string> = {
  today: "groupToday",
  yesterday: "groupYesterday",
  earlier: "groupEarlier",
};

function groupOf(at: string): DateGroup {
  const d = new Date(at);
  const now = new Date();
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "earlier";
}

/**
 * The brand of WHO started the line, in the same place for everyone:
 * the portrait of the person, the face of Numo, the logo of the agent plugged into
 * MCP, the Smart Assign wand — the vocabulary of a timeline
 * ticket (components/actor-avatars.tsx), so that the same action is recognized
 * on both sides.
 *
 * Actor misconduct — a return filed on the public board, a notification of a
 * account gone — the TYPE icon returns to its place: it is better to say what is
 * happened to draw a face that doesn't exist.
 */
function RowAvatar({
  notification: n,
  unread,
}: {
  notification: MyNotification;
  unread: boolean;
}) {
  if (n.from_numo || AGENT_TYPES.includes(n.type)) {
    return <NumoAvatar className="size-8" iconClassName="size-5" />;
  }
  // `via_automation` (MIN-147): The channel has parked or stopped. His actor
  // is the RULE, as in the timeline — and without this test the line has neither
  // actor nor recognized type, and falls back on the comment bubble of the fallback.
  if (n.via_automation) {
    return <AutomationAvatar className="size-8" iconClassName="size-4" />;
  }
  if (n.via_smart_assign) {
    return <SmartAssignAvatar className="size-8" iconClassName="size-4" />;
  }
  if (n.via_mcp) {
    return (
      <McpAvatar
        agent={n.api_key_agent}
        className="size-8"
        iconClassName="size-4"
      />
    );
  }
  if (n.actor_avatar_seed) {
    return (
      <UserAvatar
        seed={n.actor_avatar_seed}
        className="size-8"
        title={n.actor_name ?? undefined}
      />
    );
  }
  // A PR action comes from a forge account, not from a minddy user:
  // no portrait to draw, the guy icon says what happened (MIN-138).
  const Icon =
    n.type === "assigned"
      ? UserPlus
      : n.type === "mention" || n.type === "page_mention"
        ? AtSign
        : n.type === "feedback_new"
          ? Megaphone
          : n.type === "pr_merged"
            ? GitMerge
            : n.type === "pr_reviewed" || n.type === "pr_opened"
              ? GitPullRequest
              : MessageSquare;
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        unread ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground"
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const t = useTranslations("Inbox");
  const tIssue = useTranslations("Issue");
  const tProjects = useTranslations("Projects");
  // The only borrowing from the timeline: the folding of an unnamed MCP key, which is said
  // in the same place on both sides.
  const tTimeline = useTranslations("Timeline");
  // The words that the line borrows, collected once: the formulation, it,
  // lives in lib/notification-line.ts — the same as a pushed banner and
  // as a native desktop app notification (MIN-291).
  const labels = {
    someone: t("someone"),
    mcpFallback: tTimeline("mcpFallback"),
    somePageFallback: t("somePageFallback"),
    someAgentConversationFallback: t("someAgentConversationFallback"),
    someIssueFallback: t("someIssueFallback", {
      entity: tIssue("entity").toLowerCase(),
    }),
  };
  const format = useFormatter();
  // Stable time reference for relative timestamps, refreshed
  // every minute — otherwise next-intl falls back to Date.now() and warns.
  const now = useNow({ updateInterval: 60_000 });
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
  // Project invitations are not notifications: they live in
  // their table, respond to each other instead of reading each other, and disappear once
  // answered. They therefore arrive here in their own section, at the head - but with
  // exactly the same buttons as the home banner.
  const {
    invitations,
    busyId: invitationBusyId,
    answer: answerInvitation,
  } = useInvitationResponder();
  const [filter, setFilter] = useState<InboxFilter>("all");

  const visible = useMemo(() => {
    switch (filter) {
      case "unread":
        return notifications.filter((n) => !n.read_at);
      case "mentions":
        // A quote in a PAGE is one (MIN-278): the filter responds to
        // “where was I called”, not “in what type of object”.
        return notifications.filter(
          (n) => n.type === "mention" || n.type === "page_mention"
        );
      default:
        return notifications;
    }
  }, [notifications, filter]);

  // The list arrives sorted by desc date — the groups fill in
  // l'ordre Aujourd'hui / Hier / Plus ancien.
  const groups = useMemo(() => {
    const buckets = new Map<DateGroup, MyNotification[]>();
    for (const n of visible) {
      const g = groupOf(n.created_at);
      const list = buckets.get(g);
      if (list) list.push(n);
      else buckets.set(g, [n]);
    }
    return [...buckets.entries()];
  }, [visible]);

  const readCount = notifications.length - unreadCount;
  // An unanswered invitation is by nature “unread”: it counts towards the
  // filter and remains visible when selected. Only “Mentions” rules it out.
  const showInvitations = filter !== "mentions" && invitations.length > 0;
  const pendingCount = unreadCount + invitations.length;

  /**
   * Nothing at all: no notifications, no pending invitations. Neither the
   * filters nor head actions then have any effect — the screen is reduced to the
   * scene, and the shortcut to what decides what lands here. HAS
   * distinguish it from an empty FILTER, which keeps the page and its “Nothing here” line.
   */
  const trulyEmpty = !loading && notifications.length === 0 && invitations.length === 0;

  // Any mutation is optimistic in the hook — here we only handle failure.
  const act = (p: Promise<void>) =>
    void p.catch((e) => toast.error((e as Error).message));

  // The destination is `lib/notification-target.ts` — the same as
  // will follow the click on the SYSTEM notification (MIN-183), which does not have this
  // page at hand to recalculate it.
  const open = (n: MyNotification) => {
    if (!n.read_at) act(markRead([n.id]));
    const path = notificationTargetPath(n);
    if (path) router.push(path);
  };

  /** Line 1: what we're talking about — ref + ticket title, or target name. */
  const titleOf = (n: MyNotification): string => notificationTitle(n, labels);

  /** Who invites: their name, failing that their address, failing that “Someone”. */
  const inviterOf = (inv: MyInvitation): string =>
    inv.inviter_name || inv.inviter_email || t("someone");

  /** Line 2: who did what — supplemented by the excerpt from the comment. */
  const sentenceOf = (n: MyNotification): string => {
    const sentence = t(NOTIFICATION_LINE_KEYS[n.type], {
      actor: notificationActor(n, labels),
    });
    return n.comment_excerpt ? `${sentence} : ${n.comment_excerpt}` : sentence;
  };

  if (trulyEmpty) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <EmptyScene icon={Inbox} title={t("emptyTitle")}>
          <Button variant="outline" asChild>
            <Link href="/settings?tab=inbox">
              <Settings className="size-4" />
              {t("settings")}
            </Link>
          </Button>
        </EmptyScene>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <div className="flex items-center gap-2">
          {readCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => act(clearRead())}>
              {t("clearRead")}
            </Button>
          )}
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => act(markAllRead())}>
              {t("markAllRead")}
            </Button>
          )}
          {/* Shortcut to the Inbox tab of account settings — it's there
              qu'on choisit ce qui atterrit ici. */}
          <IconButton size="sm" aria-label={t("settings")} title={t("settings")} asChild>
            <Link href="/settings?tab=inbox">
              <Settings className="size-4" />
            </Link>
          </IconButton>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1">
        {FILTERS.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors",
              filter === key
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {t(labelKey as Parameters<typeof t>[0])}
            {key === "unread" && pendingCount > 0 && (
              <span className="tabular-nums text-xs text-muted-foreground">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {showInvitations && (
        <section className="mt-6">
          <h2 className="mb-2 px-1 text-xs font-medium text-muted-foreground">
            {t("groupInvitations")}
          </h2>
          <ul
            data-inbox-invitations
            className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card"
          >
            {invitations.map((inv) => {
              const busy = invitationBusyId === inv.id;
              return (
                <li key={inv.id} className="relative flex items-center gap-3 px-4 py-3">
                  {/* The portrait of who is inviting, instead of the type icon:
 an invitation comes from someone, not from a system — and the
 same badge as the unread notifications at its corner. */}
                  <span className="relative shrink-0">
                    <UserAvatar
                      seed={inv.inviter_avatar_seed}
                      className="size-8"
                      title={inviterOf(inv)}
                    />
                    <span
                      className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-blue-500 ring-2 ring-card"
                      aria-hidden
                    />
                  </span>
                  {/* The name of the project is enough — its key means nothing to anyone who is not there
 not entered yet. */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {inv.project_name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {t("lineInvitation", { actor: inviterOf(inv) })}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void answerInvitation(inv.id, "reject")}
                    >
                      {tProjects("reject")}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void answerInvitation(inv.id, "accept")}
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
        <div className="mt-6 flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        // Only an invitation takes the place of content: “you are up to date”
        // would lie just below something that requires a response. Without
        // invitation, the entire page has already left on its stage, higher up.
        null
      ) : visible.length === 0 ? (
        showInvitations ? null : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {t("emptyFiltered")}
          </p>
        )
      ) : (
        groups.map(([group, items]) => (
          <section key={group} className="mt-6">
            <h2 className="mb-2 px-1 text-xs font-medium text-muted-foreground">
              {t(GROUP_KEYS[group] as Parameters<typeof t>[0])}
            </h2>
            <ul
              data-inbox-list
              className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card"
            >
              {items.map((n) => {
                const unread = !n.read_at;
                return (
                  <li key={n.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => open(n)}
                      className={cn(
                        "relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                        "hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                      )}
                    >
                      {/* Unread: blue; YELLOW when Numo is waiting for a response —
 same language as the list of agent sessions.
 The point is a BADGE placed at the corner of the portrait, not a
 pastille placed before it: it takes no place
 in the flow, so nothing shifts from a line read to
 a unread. The ring detaches him from the portrait. */}
                      <span className="relative shrink-0">
                        <RowAvatar notification={n} unread={unread} />
                        {unread && (
                          <span
                            className={cn(
                              "absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-card",
                              n.type === "agent_question"
                                ? "bg-yellow-500"
                                : "bg-blue-500"
                            )}
                            aria-hidden
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          {n.issue_id && n.project_key && n.issue_number != null && (
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                              {n.project_key}-{n.issue_number}
                            </span>
                          )}
                          {/* A PR can be recognized by its number, in the place where a
 ticket carries its reference. */}
                          {n.pull_request_id && n.pull_request_number != null && (
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                              #{n.pull_request_number}
                            </span>
                          )}
                          <span
                            className={cn(
                              "truncate text-sm",
                              unread
                                ? "font-medium text-foreground"
                                : "text-muted-foreground"
                            )}
                          >
                            {titleOf(n)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {sentenceOf(n)}
                        </span>
                      </span>
                      <span
                        className="shrink-0 text-xs tabular-nums text-muted-foreground transition-opacity group-hover:opacity-0"
                        title={format.dateTime(new Date(n.created_at), {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      >
                        {format.relativeTime(new Date(n.created_at), now)}
                      </span>
                    </button>
                    {/* Actions on hover — overlaid on the timestamp. */}
                    <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      {unread ? (
                        <IconButton
                          size="sm"
                          aria-label={t("markOneRead")}
                          title={t("markOneRead")}
                          onClick={() => act(markRead([n.id]))}
                        >
                          <MailOpen className="size-4" />
                        </IconButton>
                      ) : (
                        <IconButton
                          size="sm"
                          aria-label={t("markUnread")}
                          title={t("markUnread")}
                          onClick={() => act(markUnread([n.id]))}
                        >
                          <Mail className="size-4" />
                        </IconButton>
                      )}
                      <IconButton
                        size="sm"
                        aria-label={t("delete")}
                        title={t("delete")}
                        onClick={() => act(remove([n.id]))}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
