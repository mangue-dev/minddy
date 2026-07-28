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
  Mail,
  MailOpen,
  Settings,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import {
  McpAvatar,
  NumoAvatar,
  SmartAssignAvatar,
} from "@/components/actor-avatars";
import { UserAvatar } from "@/components/user-avatar";
import { mcpActorLabel } from "@/lib/mcp-agents";
import { useNotifications } from "@/lib/use-notifications";
import { useInvitationResponder } from "@/lib/use-invitations-query";
import type { MyInvitation, MyNotification, NotificationType } from "@/lib/types";

const AGENT_TYPES: readonly NotificationType[] = [
  "agent_done",
  "agent_question",
  "agent_failed",
];

/** i18n key of the "who did what" sentence under the title. */
const LINE_KEYS: Record<NotificationType, string> = {
  assigned: "lineAssigned",
  mention: "lineMention",
  comment: "lineComment",
  agent_done: "lineAgentDone",
  agent_question: "lineAgentQuestion",
  agent_failed: "lineAgentFailed",
  feedback_new: "lineFeedbackNew",
};

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
 * La marque de QUI a déclenché la ligne, au même endroit pour tout le monde :
 * le portrait de la personne, le visage de Numo, le logo de l'agent branché sur
 * le MCP, la baguette de Smart Assign — le vocabulaire de la timeline d'un
 * ticket (components/actor-avatars.tsx), pour que la même action se reconnaisse
 * des deux côtés.
 *
 * Faute d'acteur — un retour déposé sur le board public, une notification d'un
 * compte parti — l'icône du TYPE reprend sa place : mieux vaut dire ce qui est
 * arrivé que dessiner un visage qui n'existe pas.
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
  const Icon =
    n.type === "assigned"
      ? UserPlus
      : n.type === "mention"
        ? AtSign
        : n.type === "feedback_new"
          ? Megaphone
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
  // Le seul emprunt à la timeline : le repli d'une clé MCP sans nom, qui se dit
  // au même endroit des deux côtés.
  const tTimeline = useTranslations("Timeline");
  const format = useFormatter();
  // Référence de temps stable pour les horodatages relatifs, rafraîchie
  // chaque minute — sans ça next-intl retombe sur Date.now() et prévient.
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
  // Les invitations de projet ne sont pas des notifications : elles vivent dans
  // leur table, se répondent au lieu de se lire, et disparaissent une fois
  // répondues. Elles arrivent donc ici en section propre, en tête — mais avec
  // exactement les mêmes boutons que la bannière de la home.
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
        return notifications.filter((n) => n.type === "mention");
      default:
        return notifications;
    }
  }, [notifications, filter]);

  // La liste arrive triée par date desc — les groupes se remplissent dans
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
  // Une invitation sans réponse est par nature « non lue » : elle compte dans le
  // filtre et reste visible quand on le sélectionne. Seul « Mentions » l'écarte.
  const showInvitations = filter !== "mentions" && invitations.length > 0;
  const pendingCount = unreadCount + invitations.length;

  // Toute mutation est optimiste dans le hook — ici on ne gère que l'échec.
  const act = (p: Promise<void>) =>
    void p.catch((e) => toast.error((e as Error).message));

  const open = (n: MyNotification) => {
    if (!n.read_at) act(markRead([n.id]));
    if (n.project_id && n.objective_id) {
      router.push(`/projects/${n.project_id}/objectives?open=${n.objective_id}`);
    } else if (n.project_id && n.feedback_post_id) {
      router.push(`/projects/${n.project_id}/feedback?post=${n.feedback_post_id}`);
    } else if (n.project_id && n.issue_id) {
      router.push(`/projects/${n.project_id}?issue=${n.issue_id}`);
    }
  };

  /** Ligne 1 : ce dont on parle — réf + titre du ticket, ou nom de la cible. */
  const titleOf = (n: MyNotification): string => {
    if (n.objective_id) return n.objective_name ?? "";
    if (n.feedback_post_id) return n.feedback_title ?? "";
    return (
      n.issue_title ??
      t("someIssueFallback", { entity: tIssue("entity").toLowerCase() })
    );
  };

  /** Qui invite : son nom, à défaut son adresse, à défaut « Quelqu'un ». */
  const inviterOf = (inv: MyInvitation): string =>
    inv.inviter_name || inv.inviter_email || t("someone");

  /** Le nom de l'acteur, dans les mêmes termes que la timeline : une action
   *  passée par le MCP est celle de l'AGENT, une affectation automatique celle
   *  de Smart Assign — jamais « Quelqu'un », qui ne renseigne personne. */
  const actorOf = (n: MyNotification): string => {
    if (n.via_smart_assign) return "Smart Assign";
    if (n.via_mcp) {
      return mcpActorLabel(n.api_key_agent, n.api_key_name, tTimeline("mcpFallback"));
    }
    return n.actor_name ?? t("someone");
  };

  /** Ligne 2 : qui a fait quoi — complétée par l'extrait du commentaire. */
  const sentenceOf = (n: MyNotification): string => {
    const sentence = t(LINE_KEYS[n.type] as Parameters<typeof t>[0], {
      actor: actorOf(n),
    });
    return n.comment_excerpt ? `${sentence} : ${n.comment_excerpt}` : sentence;
  };

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
          {/* Raccourci vers l'onglet Inbox des réglages du compte — c'est là
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
                <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="size-2 shrink-0 rounded-full bg-blue-500" aria-hidden />
                  {/* Le portrait de qui invite, à la place de l'icône de type :
                      une invitation vient de quelqu'un, pas d'un système. */}
                  <UserAvatar
                    seed={inv.inviter_avatar_seed}
                    className="size-8"
                    title={inviterOf(inv)}
                  />
                  {/* Le nom du projet suffit — sa clé ne dit rien à qui n'y est
                      pas encore entré. */}
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
        // Une invitation seule tient lieu de contenu : le « vous êtes à jour »
        // mentirait juste en dessous d'une chose qui attend une réponse.
        showInvitations ? null : (
          <EmptyState
            className="mt-6"
            icon={<Inbox className="size-6" />}
            description={t("emptyMessage")}
          />
        )
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
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                        "hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                      )}
                    >
                      {/* Non lu : bleu ; JAUNE quand Numo attend une réponse —
                          même langage que la liste des sessions d'agent. */}
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          unread
                            ? n.type === "agent_question"
                              ? "bg-yellow-500"
                              : "bg-blue-500"
                            : "bg-transparent"
                        )}
                        aria-hidden
                      />
                      <RowAvatar notification={n} unread={unread} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          {n.issue_id && n.project_key && n.issue_number != null && (
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                              {n.project_key}-{n.issue_number}
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
                    {/* Actions au survol — en calque sur l'horodatage. */}
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
