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
  // Une routine, c'est Numo qui tourne tout seul : son visage, comme un run.
  "routine_done",
  // Une écriture d'agent dans une page (MIN-278) : la ligne n'a PAS d'acteur
  // humain — c'est justement ce qu'elle annonce —, et sans son visage ici elle
  // retomberait sur la bulle de commentaire du repli.
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
  // `via_automation` (MIN-147) : la chaîne s'est garée ou arrêtée. Son acteur
  // est la RÈGLE, comme dans la timeline — et sans ce test la ligne n'a ni
  // acteur ni type reconnu, et retombe sur la bulle de commentaire du repli.
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
  // Une action de PR vient d'un compte de la forge, pas d'un utilisateur minddy :
  // aucun portrait à dessiner, l'icône du type dit ce qui est arrivé (MIN-138).
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
  // Le seul emprunt à la timeline : le repli d'une clé MCP sans nom, qui se dit
  // au même endroit des deux côtés.
  const tTimeline = useTranslations("Timeline");
  // Les mots que la ligne emprunte, rassemblés une fois : la formulation, elle,
  // vit dans lib/notification-line.ts — la même qu'une bannière poussée et
  // qu'une notification native de l'app de bureau (MIN-291).
  const labels = {
    someone: t("someone"),
    mcpFallback: tTimeline("mcpFallback"),
    somePageFallback: t("somePageFallback"),
    someIssueFallback: t("someIssueFallback", {
      entity: tIssue("entity").toLowerCase(),
    }),
  };
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
        // Une citation dans une PAGE en est une (MIN-278) : le filtre répond à
        // « où m'a-t-on appelé », pas « dans quel type d'objet ».
        return notifications.filter(
          (n) => n.type === "mention" || n.type === "page_mention"
        );
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

  /**
   * Rien du tout : aucune notification, aucune invitation en attente. Ni les
   * filtres ni les actions de tête n'ont alors de prise — l'écran se réduit à la
   * scène, et au raccourci vers ce qui décide de ce qui atterrit ici. À
   * distinguer d'un FILTRE vide, qui garde la page et sa ligne « Rien ici ».
   */
  const trulyEmpty = !loading && notifications.length === 0 && invitations.length === 0;

  // Toute mutation est optimiste dans le hook — ici on ne gère que l'échec.
  const act = (p: Promise<void>) =>
    void p.catch((e) => toast.error((e as Error).message));

  // La destination est celle de `lib/notification-target.ts` — la même que
  // suivra le clic sur la notification SYSTÈME (MIN-183), qui n'a pas cette
  // page sous la main pour la recalculer.
  const open = (n: MyNotification) => {
    if (!n.read_at) act(markRead([n.id]));
    const path = notificationTargetPath(n);
    if (path) router.push(path);
  };

  /** Ligne 1 : ce dont on parle — réf + titre du ticket, ou nom de la cible. */
  const titleOf = (n: MyNotification): string => notificationTitle(n, labels);

  /** Qui invite : son nom, à défaut son adresse, à défaut « Quelqu'un ». */
  const inviterOf = (inv: MyInvitation): string =>
    inv.inviter_name || inv.inviter_email || t("someone");

  /** Ligne 2 : qui a fait quoi — complétée par l'extrait du commentaire. */
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
                <li key={inv.id} className="relative flex items-center gap-3 px-4 py-3">
                  {/* Le portrait de qui invite, à la place de l'icône de type :
                      une invitation vient de quelqu'un, pas d'un système — et le
                      même badge que les notifications non lues à son coin. */}
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
        // mentirait juste en dessous d'une chose qui attend une réponse. Sans
        // invitation, la page entière est déjà partie sur sa scène, plus haut.
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
                      {/* Non lu : bleu ; JAUNE quand Numo attend une réponse —
                          même langage que la liste des sessions d'agent.
                          Le point est un BADGE posé au coin du portrait, pas une
                          pastille placée avant lui : il ne prend aucune place
                          dans le flux, donc rien ne se décale d'une ligne lue à
                          une non lue. L'anneau le détache du portrait. */}
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
                          {/* Une PR se reconnaît à son numéro, à la place où un
                              ticket porte sa référence. */}
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
