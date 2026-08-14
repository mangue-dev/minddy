"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
  toast,
} from "mangue-ui";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Github,
  Gitlab,
  MessageSquare,
  MoreHorizontal,
  Reply,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import Link from "next/link";
import { BotBadge, GitLogin } from "@/components/git/git-login";
import { Markdown } from "@/components/markdown";
import { TAB_LIST_DENSE, TAB_TRIGGER_DENSE } from "@/components/tab-bar";
import { NumoIcon } from "@/components/numo-icon";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { PrCommits } from "@/components/pull-requests/pr-commits";
import { PrCommentComposer } from "@/components/pull-requests/pr-comment-composer";
import { PrDiff } from "@/components/pull-requests/pr-diff";
import { PrLinkIssue } from "@/components/pull-requests/pr-link-issue";
import {
  CommentReactionChips,
  ReactionPicker,
  reactionToggler,
  useCommentReactions,
  type CommentReactions,
} from "@/components/pull-requests/pr-review-comments";
import {
  PrReviewCard,
} from "@/components/pull-requests/pr-review-thread";
import { PrTimelineReview, PrTimelineRow } from "@/components/pull-requests/pr-timeline";
import { PrStateBadge } from "@/components/pull-requests/pr-state-badge";
import { PrViewerCallout } from "@/components/pull-requests/pr-viewer-callout";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";
import { UserAvatar } from "@/components/user-avatar";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import {
  usePullRequestQuery,
  usePrCommentsQuery,
  usePrCommitsQuery,
  usePrReviewCommentsQuery,
} from "@/lib/use-agent-runs";
import {
  actOnPullRequestApi,
  postPullRequestCommentApi,
  prEndpoint,
  requestPullRequestAiReviewApi,
  submitPullRequestReviewApi,
  type ChecksSummary,
  type CheckState,
  type MergeMethod,
  type PullRequestComment,
  type PullRequestCommit,
  type PullRequestListItem,
  type PullRequestReviewComment,
  type ReviewVerdict,
} from "@/lib/agent-api";
import { PrEndpointProvider } from "@/lib/pr-endpoint-context";
import { issueIdentifier } from "@/lib/issue-constants";
import { usePrReviewSession } from "@/lib/use-pr-review-session";
import { usePrLive } from "@/lib/use-pr-live";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { PR_BODY_COMMENT_ID } from "@/lib/pr-review-reactions";
import {
  groupTimelineCommits,
  groupTimelineReviews,
  resolveCommitActors,
  sortTimelineOlderFirst,
  type PrTimelineEvent,
} from "@/lib/pr-timeline";
import type { MessageKey } from "@/lib/i18n-keys";
import { parseForgeLogin, prIdentifier, type RepoProviderId } from "@/lib/repo-providers";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Panneau de détail d'une PR (MIN-66 + MIN-138 + MIN-143) : en-tête (ticket +
 * état + actions), bandeau de checks CI, puis deux onglets façon GitHub — le fil
 * de conversation (description de la PR + commentaires) et les fichiers modifiés.
 * Tout est piloté par `item.prId` : depuis MIN-143 la PR n'appartient plus au run
 * qui l'a ouverte, et une PR humaine n'en a aucun.
 *
 * Ce que le run décide encore : le badge « Généré par Numo » et la case « et
 * relancer Numo ». Sans run, tous les autres gestes restent — merge, refus,
 * review, commentaires sont des gestes de forge, pas des gestes d'agent.
 *
 * Trois gestes dans la barre d'actions : **Review** (approuver / demander des
 * changements / commenter, avec la case « et relancer Numo » qui n'existe que
 * chez minddy), **Refuser** (ferme la PR), **Fusionner** (split button : la
 * méthode principale est le squash, le chevron donne les autres méthodes que la
 * forge accepte).
 */

/** Pastille d'état d'un check. `pending` pulse : c'est le seul état qui bouge. */
function CheckDot({ state, className }: { state: CheckState; className?: string }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        state === "success" && "bg-emerald-500",
        state === "failure" && "bg-destructive",
        state === "pending" && "animate-pulse bg-amber-500",
        state === "neutral" && "bg-muted-foreground/50",
        className,
      )}
    />
  );
}

/**
 * Logo de l'intégration qui a produit le check — GitHub sert le VRAI logo de
 * chaque App (Vercel, Socket Security, GitHub Actions…), c'est lui qu'on affiche
 * plutôt qu'une icône générique. Le repli est l'icône de la forge : chez GitLab
 * le CI est GitLab, et il n'y a pas d'autre logo à montrer.
 *
 * Fond neutre derrière l'image : beaucoup de ces logos sont transparents et
 * monochromes — sans lui, un logo noir disparaît en thème sombre.
 */
function CheckLogo({ url, provider }: { url: string | null; provider: RepoProviderId }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="size-5 shrink-0 rounded-[4px] bg-muted object-cover"
      />
    );
  }
  const Icon = provider === "gitlab" ? Gitlab : Github;
  return (
    <Icon className="size-5 shrink-0 rounded-[4px] bg-muted p-0.5 text-muted-foreground" />
  );
}

/** « 42 s », « 3 min 7 s ». `null` quand la forge ne date pas le check. */
function checkDuration(
  t: ReturnType<typeof useTranslations<"PullRequests">>,
  durationMs: number | null,
): string | null {
  if (durationMs == null) return null;
  const seconds = Math.round(durationMs / 1000);
  return seconds < 60
    ? t("checkDurationSeconds", { seconds })
    : t("checkDurationMinutes", {
        minutes: Math.floor(seconds / 60),
        seconds: seconds % 60,
      });
}

/** Le mot de l'état, pour les checks dont la forge ne dit rien de plus. */
const CHECK_STATE_KEY: Record<CheckState, MessageKey<"PullRequests">> = {
  success: "checkStateSuccess",
  failure: "checkStateFailure",
  pending: "checkStatePending",
  neutral: "checkStateNeutral",
};

/**
 * Bandeau de checks CI. Replié il tient en une ligne (« 3/4 réussis ») ; déplié
 * il liste chaque check comme GitHub le fait : le logo de l'intégration, le nom
 * du check, ce que la forge dit du résultat, sa durée, et le lien vers la forge.
 *
 * Trois « pas de checks » différents, et ils ne se disent pas pareil :
 * `error` = on n'a pas pu lire (permission de la GitHub App non acceptée par
 * l'installation), `total === 0` = ce dépôt n'a pas de CI, et le cas normal.
 */
function ChecksBanner({
  checks,
  error,
  provider,
}: {
  checks: ChecksSummary | null;
  error: "forbidden" | "unknown" | null;
  provider: RepoProviderId;
}) {
  const t = useTranslations("PullRequests");
  const [open, setOpen] = useState(false);

  if (error) {
    return (
      <p className="text-xs text-muted-foreground">{t("checksUnavailable")}</p>
    );
  }
  if (!checks || checks.total === 0) return null;

  const label =
    checks.state === "failure"
      ? t("checksFailing", { passing: checks.passing, total: checks.total })
      : checks.state === "pending"
        ? t("checksPending", { passing: checks.passing, total: checks.total })
        : t("checksPassing", { total: checks.total });

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left outline-none"
      >
        <CheckDot state={checks.state ?? "neutral"} />
        <span className="text-sm font-medium">{label}</span>
        {open ? (
          <ChevronDown className="ml-auto size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
        )}
      </button>
      {open ? (
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {checks.checks.map((c) => {
            const duration = checkDuration(t, c.durationMs);
            // Ce que la forge dit du résultat, sinon le mot de l'état : « Échec »
            // seul reste plus utile qu'une deuxième ligne vide sous le nom.
            const detail = [c.appName, c.description ?? t(CHECK_STATE_KEY[c.state])]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={c.name} className="flex items-center gap-2.5 px-3.5 py-2.5">
                <CheckDot state={c.state} />
                <CheckLogo url={c.appAvatarUrl} provider={provider} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{detail}</p>
                </div>
                {duration ? (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {duration}
                  </span>
                ) : null}
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-xs text-brand hover:underline"
                  >
                    {t("checkDetails")}
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Une entrée du fil de conversation, messages ET activité confondus (MIN-159).
 * Le fil est UNE suite chronologique, comme sur GitHub : un commentaire, une
 * review, un push et un changement de titre s'y lisent dans l'ordre où ils ont
 * eu lieu, pas dans trois listes séparées.
 */
type FeedEntry =
  | { key: string; id: string; createdAt: string | null; kind: "comment"; comment: PullRequestComment }
  | { key: string; id: string; createdAt: string | null; kind: "event"; event: PrTimelineEvent }
  | {
      key: string;
      id: string;
      createdAt: string | null;
      kind: "review";
      event: PrTimelineEvent;
      comments: PullRequestReviewComment[];
    };

/**
 * Messages + activité, fusionnés et remis dans l'ordre.
 *
 * Quatre règles portent tout le rendu :
 *  - un commit est signé par son COMPTE de forge, pas par le `user.name` écrit
 *    dedans (`resolveCommitActors`) : la timeline ne connaît que le second, et
 *    la liste des commits — déjà chargée pour son onglet — porte le premier ;
 *  - les commits CONSÉCUTIFS se replient en un seul « a poussé N commits »
 *    (`groupTimelineCommits`), sans quoi une PR de vingt commits noierait les
 *    trois messages qui comptent ;
 *  - les reviews sans corps du même auteur se replient de même
 *    (`groupTimelineReviews`) : chez GitHub, un point posé seul EST une review,
 *    et une passe de Numo en dépose une douzaine d'affilée ;
 *  - une review devient une CARTE dès qu'elle a quelque chose à dire — un corps,
 *    ou des points posés sur le code. Une approbation nue reste une ligne : elle
 *    n'a pas de contenu, et lui donner une carte vide serait mentir sur son poids.
 */
function buildFeed(
  comments: PullRequestComment[],
  timeline: PrTimelineEvent[],
  reviewComments: PullRequestReviewComment[],
  commits: PullRequestCommit[],
): FeedEntry[] {
  const commentsByReview = new Map<number, PullRequestReviewComment[]>();
  for (const comment of reviewComments) {
    if (comment.review_id == null) continue;
    const list = commentsByReview.get(comment.review_id);
    if (list) list.push(comment);
    else commentsByReview.set(comment.review_id, [comment]);
  }

  const entries: FeedEntry[] = comments.map((comment) => ({
    key: `comment:${comment.id}`,
    id: `comment:${comment.id}`,
    createdAt: comment.created_at,
    kind: "comment",
    comment,
  }));

  // L'ordre compte : les comptes d'abord, sinon le regroupement des commits
  // comparerait des noms git là où deux poussées du même compte doivent se
  // reconnaître.
  const events = groupTimelineReviews(
    groupTimelineCommits(resolveCommitActors(timeline, commits)),
  );
  for (const event of events) {
    if (event.kind === "reviewed") {
      const own = (event.reviewIds ?? []).flatMap((id) => commentsByReview.get(id) ?? []);
      if (event.body || own.length > 0) {
        entries.push({
          key: event.id,
          id: event.id,
          createdAt: event.createdAt,
          kind: "review",
          event,
          comments: own,
        });
        continue;
      }
    }
    entries.push({ key: event.id, id: event.id, createdAt: event.createdAt, kind: "event", event });
  }

  return sortTimelineOlderFirst(entries);
}

/**
 * Une entrée du fil : avatar, auteur, heure, corps markdown, réactions. Sert
 * autant à la description de la PR (le commentaire qui OUVRE le fil) qu'aux
 * commentaires qui suivent — côté GitHub c'est la même chose, et le fil ne se lit
 * comme un fil que si son premier message a la même forme que les autres.
 *
 * Cette égalité vaut aussi pour les réactions (MIN-147) : `commentId` vaut
 * `PR_BODY_COMMENT_ID` pour la description, ce que le serveur traduit dans le
 * sujet que chaque forge attend. Réagir marche donc PARTOUT dans la PR — le fil
 * comme le diff — au lieu des seuls commentaires ancrés à une ligne de code.
 */
function ThreadComment({
  commentId,
  user,
  createdAt,
  body,
  onQuoteReply,
  quotingNumo,
  reactions,
  activity,
}: {
  commentId: number;
  user: { login: string; avatar_url: string | null } | null;
  createdAt: string | null;
  body: string;
  /** Absent quand il n'y a pas de composer où citer : citer sans pouvoir
      répondre ne mène nulle part (MIN-144). */
  onQuoteReply?: () => void;
  /** Ce message est de Numo : citer le RAPPELLE (MIN-162), et le geste se nomme
      autrement — « Répondre en citant » ne dit pas qu'il va relancer une passe. */
  quotingNumo?: boolean;
  /** Absentes quand la forge n'a pas su les lire : on n'affiche alors rien. */
  reactions?: CommentReactions;
  /** Déroulé replié AU-DESSUS du corps, pour le message qui en porte un — la
      review de Numo est le seul cas : son verdict est le message, son travail
      est ce qui l'a produit. */
  activity?: React.ReactNode;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const now = useNow();
  const list = reactions?.byComment.get(commentId) ?? [];

  return (
    <li className="group/comment flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2">
        <UserAvatar
          url={user?.avatar_url}
          seed={user?.login ?? "?"}
          className="size-5"
        />
        <GitLogin
          login={user?.login}
          className="text-sm font-medium text-foreground"
        />
        {createdAt ? (
          <span className="shrink-0 text-xs text-muted-foreground/80">
            {format.relativeTime(new Date(createdAt), now)}
          </span>
        ) : null}
        <span className="min-w-0 flex-1" />
        {/* Le repli de l'en-tête, pour un message SANS réaction : dès qu'il en
            porte une, la palette descend dans la bande de réactions, avec les
            emoji qu'elle ajoute. Ici elle est révélée au survol, comme le
            « Citer » à sa droite — une palette permanente sous chaque message
            ferait un damier de boutons. Rendue quand même (et non montée au
            survol) pour rester atteignable au clavier. */}
        {reactions?.canReact && list.length === 0 ? (
          <ReactionPicker
            className="-my-1 opacity-0 transition-opacity group-hover/comment:opacity-100 focus-visible:opacity-100"
            onPick={reactionToggler(reactions, commentId, list)}
          />
        ) : null}
        {onQuoteReply ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t(quotingNumo ? "quoteReplyNumo" : "quoteReply")}
                className="-my-1 size-7 rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/comment:opacity-100 focus-visible:opacity-100"
                onClick={onQuoteReply}
              >
                <Reply className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t(quotingNumo ? "quoteReplyNumo" : "quoteReply")}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {/* Le déroulé se pose à distance de l'en-tête : collé au nom, il se lisait
          comme une seconde ligne de signature. */}
      {activity ? <div className="pt-1.5">{activity}</div> : null}
      <Markdown className="text-foreground [&_code]:bg-primary/10 [&_code]:text-primary [&_pre_code]:text-inherit">
        {body}
      </Markdown>
      {reactions && list.length > 0 ? (
        <CommentReactionChips commentId={commentId} reactions={reactions} list={list} />
      ) : null}
    </li>
  );
}

export function PrDetail({
  item,
  onBack,
  onRefetchList,
  onOpenIssue,
}: {
  item: PullRequestListItem;
  onBack: () => void;
  onRefetchList: () => void;
  /** Ouvre l'issue liée dans le panneau latéral, par-dessus la page (pas de navigation). */
  onOpenIssue: (issueId: string, projectId: string) => void;
}) {
  const t = useTranslations("PullRequests");
  const tAgent = useTranslations("Agent");
  const isSend = useIsSendShortcut();
  const format = useFormatter();
  const { defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const { defaultModel } = useAgentPreferencesQuery();

  const {
    pr,
    files,
    checks,
    checksError,
    reviews,
    viewer,
    mergeMethods,
    loading,
    refetch: refetchPr,
  } = usePullRequestQuery(item.prId, true);
  const {
    comments,
    timeline,
    reactions: commentReactions,
    loading: commentsLoading,
    refetch: refetchComments,
  } = usePrCommentsQuery(item.prId);
  const {
    commits,
    truncated: commitsTruncated,
    loading: commitsLoading,
    refetch: refetchCommits,
  } = usePrCommitsQuery(item.prId);
  const {
    comments: reviewComments,
    threads: reviewThreads,
    reactions: reviewReactions,
    refetch: refetchReviewComments,
  } = usePrReviewCommentsQuery(prEndpoint(item.prId));
  // Le direct de CETTE PR (MIN-161) : le serveur pousse « telle partie a bougé »
  // sur `pull-request:{id}`, et ces quatre caches vont relire. C'est ce qui fait
  // qu'un commentaire posté sur github.com, un commit poussé, une approbation ou
  // un fil résolu atteignent le panneau ouvert sans rechargement.
  usePrLive(item.prId);

  const [acting, setActing] = useState<
    null | "merge" | "close" | "reopen" | "ready_for_review"
  >(null);
  // Le merge se confirme AVEC sa méthode : la porter dans l'état de confirmation
  // évite qu'un clic sur « fusionner quand même » retombe sur le squash par défaut.
  const [confirmAction, setConfirmAction] = useState<
    null | { kind: "merge"; method?: MergeMethod } | { kind: "close" }
  >(null);
  const [reviewVerdict, setReviewVerdict] = useState<ReviewVerdict | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [relaunch, setRelaunch] = useState(true);
  /**
   * Les deux modes de « demander des changements » (le dialogue les rend en
   * onglets, et seule cette demande-là en a deux) :
   *  · `write`    — on écrit la consigne. Elle sert de VERDICT sur la forge et de
   *                 prompt à Numo : c'est le geste historique ;
   *  · `findings` — on ne l'écrit pas, on demande à Numo de reprendre les
   *                 remarques DÉJÀ laissées sur la PR. Rien n'est publié au nom
   *                 de la personne : le texte est une consigne, pas une review.
   */
  const [reviewMode, setReviewMode] = useState<"write" | "findings">("write");
  // Modèle de la run à lancer — vide = le défaut du compte (MIN-68 : relancer Numo
  // est un lancement à froid, il a donc son propre choix de modèle).
  const [model, setModel] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  // Numo relit la PR (MIN-141) : une SESSION, pas un appel bloquant — elle se
  // joue DANS le fil, à la place de son futur message de verdict, et survit à un
  // rechargement.
  const reviewSession = usePrReviewSession(item.prId);
  const [aiReviewDialog, setAiReviewDialog] = useState(false);
  const [aiReviewModel, setAiReviewModel] = useState("");
  const [startingAiReview, setStartingAiReview] = useState(false);
  const [tab, setTab] = useState<"activity" | "commits" | "files">("activity");
  // Fondu doux en haut et en bas du fil — le même que la conversation d'agent et
  // que les colonnes du board : il ne s'allume que du côté où il RESTE quelque
  // chose à voir, ce qu'une bordure fixe ne sait pas dire.
  const feedFade = useScrollFade<HTMLDivElement>();
  // « Citer » écrit dans le brouillon depuis l'extérieur du composer : ce
  // compteur lui dit d'aller reprendre le curseur.
  const [quoteFocus, setQuoteFocus] = useState(0);
  // Le message auquel ce brouillon répond, avec la citation qu'il a insérée —
  // c'est elle qui atteste, à l'envoi, qu'on répond toujours à ce message-là.

  const isWorking = !!item.activeRunId;
  // Ce que CE compte git peut faire sur ce dépôt (MIN-144). Un geste humain part
  // du compte de la personne : sans compte, ou sans droit, l'affordance
  // DISPARAÎT — c'est le bandeau qui explique, une fois, en haut.
  const canWrite = viewer?.capability === "write";
  const canComment = canWrite || viewer?.capability === "read";
  // Réagir au fil (MIN-147) : même hook, mêmes chips, même palette que le diff —
  // seule la route change. `canComment` (donc `read`) suffit : le retrait relit
  // les réactions du message avec ce token, comme côté review.
  const threadReactions = useCommentReactions(
    prEndpoint(item.prId),
    refetchComments,
    commentReactions,
    !!canComment,
    "conversation",
  );
  // « Et relancer Numo » n'existe que si un run porte déjà cette PR : c'est de
  // SES runs que la nouvelle hérite la branche (MIN-143). Une PR humaine n'a
  // rien à hériter.
  //
  // Le TICKET n'entre pas dans cette condition (MIN-292). Il y était, et il
  // fermait le geste sur les PR ouvertes par une session CARNET — c'est-à-dire
  // sur des PR de Numo, avec leur branche et leurs runs, à qui l'écran répondait
  // « Numo n'a jamais travaillé sur cette pull request ». La lignée d'une PR sans
  // ticket, c'est la PR elle-même : le serveur la lit par son numéro.
  const canRelaunch = !!item.runId;
  // `item` vient de la liste (valeur DB, éventuellement en retard d'un webhook),
  // `pr` du GET de la forge (la vérité) : la forge gagne dès qu'elle a répondu.
  const isDraft = pr?.draft ?? item.pr_state === "draft";
  const isTerminal = item.pr_state === "merged" || item.pr_state === "closed";
  const badgeState = isDraft && !isTerminal ? "draft" : item.pr_state;
  // Fermée n'est pas fini : les deux forges rouvrent, et une PR fermée par
  // erreur ne se rattrapait que sur github.com (MIN-164). Fusionnée, en
  // revanche, est définitif — la forge refuse, et il n'y a rien à proposer.
  const canReopen = canWrite && item.pr_state === "closed";
  // Une CI rouge ne bloque le merge que dans minddy : GitHub le laisse passer si
  // la branche n'est pas protégée, d'où l'échappatoire « fusionner quand même ».
  const checksFailing = checks?.state === "failure";
  const mergeBlockedByRepo = pr?.mergeableState === "blocked";
  // Le squash reste l'action principale (c'est ce que minddy fait depuis MIN-46) ;
  // le chevron n'offre que ce que la forge accepte réellement.
  const otherMethods = mergeMethods.filter((m) => m !== "squash");

  // Quand Numo termine (le run actif disparaît de la liste), rafraîchir diff +
  // commentaires. Les commentaires de ligne en font partie : Numo peut y avoir
  // répondu, et un nouveau push change les lignes auxquelles ils s'ancrent. Les
  // commits aussi : c'est le seul moment où la liste change sous les yeux.
  const prevWorking = useRef(isWorking);
  useEffect(() => {
    if (prevWorking.current && !isWorking) {
      void refetchPr();
      void refetchComments();
      void refetchCommits();
      void refetchReviewComments();
    }
    prevWorking.current = isWorking;
  }, [isWorking, refetchPr, refetchComments, refetchCommits, refetchReviewComments]);

  const aiReviewActive = reviewSession.active;

  // Quand la passe se termine, ce qu'elle a écrit est SUR la PR : la synthèse
  // dans le fil, les points dans l'onglet Fichiers. Les deux surfaces se
  // rafraîchissent, comme après une fin de run.
  const prevReviewing = useRef(aiReviewActive);
  useEffect(() => {
    if (prevReviewing.current && !aiReviewActive) {
      void refetchComments();
      void refetchReviewComments();
    }
    prevReviewing.current = aiReviewActive;
  }, [aiReviewActive, refetchComments, refetchReviewComments]);

  // Numo a-t-il déjà relu EXACTEMENT ce diff ? Tant que la tête n'a pas bougé,
  // relancer repaierait un tour de modèle pour le même code. Tête inconnue (la
  // forge n'a pas encore répondu) = on n'empêche rien : mieux vaut laisser
  // relancer que bloquer sur une ignorance.
  const currentHeadSha = pr?.headSha ?? null;
  const reviewUpToDate =
    !!currentHeadSha && reviewSession.reviewedHeadSha === currentHeadSha;

  // Quatre libellés pour UN seul geste (faire relire par Numo) : ils disent où
  // en est la passe. Le même texte sert aux trois affordances du même geste —
  // l'entrée du menu Review, le bouton de repli sans compte git, et l'entrée du
  // menu « … » du mobile —, d'où l'extraction : elles ne doivent jamais en dire
  // des choses différentes.
  const aiReviewLabel = aiReviewActive
    ? t("numoReviewRunning")
    : reviewUpToDate
      ? t("numoReviewUpToDateShort")
      : reviewSession.run
        ? t("numoReviewRerun")
        : t("aiReview");

  /**
   * La carte de la session de relecture, ou rien : elle est là dès qu'une
   * session existe sur cette PR, et elle y RESTE une fois terminée (MIN-168).
   *
   * Avant, elle disparaissait à l'arrivée du message de verdict — elle ne servait
   * qu'à tenir la place de ce message. Maintenant elle mène ailleurs : à la
   * session qui a produit la review, et à la conversation qu'on peut y continuer.
   * L'effacer ferait disparaître la seule porte d'entrée vers ce qui s'est
   * réellement passé.
   */
  const reviewCard = reviewSession.run;

  const act = async (
    action: "merge" | "close" | "reopen" | "ready_for_review",
    method?: MergeMethod,
  ) => {
    if (acting) return;
    setActing(action);
    setConfirmAction(null);
    try {
      await actOnPullRequestApi(item.prId, action, method);
      toast.success(
        action === "merge"
          ? t("mergedToast")
          : action === "close"
            ? t("closedToast")
            : action === "reopen"
              ? t("reopenedToast")
              : t("readyForReviewToast"),
      );
      onRefetchList();
      await refetchPr();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActing(null);
    }
  };

  const openReview = (verdict: ReviewVerdict) => {
    setReviewVerdict(verdict);
    setReviewMessage("");
    setReviewMode("write");
    // La relance n'a de sens que sur une demande de changements, et c'est là son
    // comportement attendu : cochée d'office.
    setRelaunch(verdict === "request_changes" && canRelaunch);
  };

  /**
   * Bascule de mode. Le prompt de « corriger les remarques » est PRÉ-ÉCRIT mais
   * reste éditable : c'est un point de départ, pas un formulaire. On ne l'écrase
   * que si la personne n'a rien écrit d'autre — revenir sur ses pas ne doit pas
   * effacer sa consigne.
   */
  const switchReviewMode = (next: "write" | "findings") => {
    setReviewMode(next);
    if (next === "findings") {
      // Corriger les remarques, c'est forcément faire travailler Numo.
      setRelaunch(true);
      if (!reviewMessage.trim()) setReviewMessage(t("reviewFindingsPrompt"));
    } else if (reviewMessage.trim() === t("reviewFindingsPrompt")) {
      setReviewMessage("");
    }
  };

  // Mode « corriger les remarques » : pas de verdict, donc aucune identité git
  // requise — c'est ce qui rend le bouton utilisable sans compte connecté. En
  // mode « écrire », le verdict ne part que si on a un compte pour le signer.
  const postVerdict = reviewMode === "write" && !!canComment;
  // La relance est le seul effet possible quand aucun verdict ne part : sans
  // elle, le geste ne ferait rien du tout.
  const relaunching = canRelaunch && (reviewMode === "findings" || relaunch) && !item.busyRunId;
  // Ni verdict à publier, ni Numo à lancer : le bouton n'a RIEN à faire (pas de
  // compte git, et une PR que Numo n'a jamais touchée — ou qu'il travaille
  // déjà). On le désactive plutôt que de laisser partir une requête que le
  // serveur refusera en `noEffect`.
  const reviewHasNoEffect =
    reviewVerdict === "request_changes" && !postVerdict && !relaunching;
  // Ce qui empêche la review de partir, et son libellé : le bouton du pied de
  // dialogue et le raccourci ⌘/Ctrl+Entrée du champ lisent les deux — sinon la
  // touche enverrait ce que le bouton refuse.
  const reviewSubmitDisabled =
    submitting || reviewHasNoEffect || (!reviewMessage.trim() && reviewVerdict !== "approve");
  const reviewSubmitLabel =
    reviewMode === "findings"
      ? t("reviewFixSubmit")
      : reviewVerdict === "request_changes" && relaunching
        ? t("sendToNumo")
        : t("reviewSubmit");

  const submitReview = async () => {
    if (!reviewVerdict || submitting || reviewHasNoEffect) return;
    const message = reviewMessage.trim();
    // Approuver sans un mot est légitime ; commenter ou demander des changements
    // sans rien dire ne l'est pas (et les deux forges refusent un corps vide).
    if (!message && reviewVerdict !== "approve") return;
    setSubmitting(true);
    try {
      const result = await submitPullRequestReviewApi(item.prId, {
        verdict: reviewVerdict,
        message,
        relaunch: relaunching && reviewVerdict === "request_changes",
        postVerdict,
        model: model || undefined,
      });
      // Trois issues, trois messages : le verdict est passé, la forge l'a replié
      // en commentaire (une App ne peut pas approuver sa propre PR — le dire,
      // plutôt que de laisser croire à une pastille verte), ou il n'y en avait
      // pas à donner et c'est Numo qui part travailler.
      toast.success(
        result.published === "none"
          ? t("sendToNumo")
          : result.published === "comment"
            ? t("selfReviewBlocked")
            : t("reviewSubmittedToast"),
      );
      setReviewVerdict(null);
      setReviewMessage("");
      onRefetchList(); // fait apparaître un éventuel nouveau run actif → polling de la liste.
      await Promise.all([refetchComments(), refetchPr()]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * « Faire vérifier par Numo » (MIN-141) — offerte sur TOUTE PR, y compris
   * celles que Numo n'a pas ouvertes : relire ne demande qu'un diff, là où
   * « relancer Numo » a besoin d'une branche à hériter.
   *
   * Le geste passe par un dialogue parce qu'il porte maintenant un CHOIX : le
   * modèle. Une grosse PR ne se relit pas comme un one-liner, et c'est au moment
   * du clic qu'on le sait — pas dans un réglage posé une fois pour toutes.
   */
  const openAiReviewDialog = () => {
    // Le dernier choix du compte, sinon « le défaut de minddy » (chaîne vide).
    setAiReviewModel(reviewSession.model?.preferred ?? "");
    setAiReviewDialog(true);
  };

  /**
   * Lance la passe et ouvre le panneau. La réponse ne l'attend pas : elle rend
   * la session, et c'est le panneau qui montre la suite en direct.
   */
  const startAiReview = async () => {
    if (startingAiReview) return;
    setStartingAiReview(true);
    try {
      await requestPullRequestAiReviewApi(item.prId, aiReviewModel);
      setAiReviewDialog(false);
      // La passe se regarde dans le fil : y ramener, sinon elle se joue sous un
      // onglet que personne ne regarde.
      setTab("activity");
      await reviewSession.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStartingAiReview(false);
    }
  };

  // Le fil d'une PR est PLAT côté GitHub (endpoint issues/{n}/comments : aucun
  // in_reply_to — seuls les commentaires de review ancrés au code sont threadés).
  // « Répondre » cite donc le message dans le composer du bas, comme le fait le
  // « Quote reply » de GitHub, et mentionne son auteur pour garder le fil lisible.
  /**
   * Ce message est-il de NUMO ? (MIN-162)
   *
   * Deux repères, et le second rattrape ce que le premier ne voit pas :
   *  · le compte sous lequel il écrit chez la forge (`viewer.numoLogin`) —
   *    complet, mais GitHub seulement : côté GitLab il n'a pas d'identité à lui
   *    (MIN-146), ses gestes partent du compte de qui a lié le dépôt — et un
   *    message de Numo s'y lit alors comme un message de cette personne.
   */
  const isNumoComment = (login?: string | null): boolean =>
    !!viewer?.numoLogin && login === viewer.numoLogin;

  /**
   * « Citer » — et, sur un message de Numo, **lui répondre**.
   *
   * Citer quelqu'un le mentionne, pour que le fil reste lisible : c'est ce que
   * fait le « Quote reply » de GitHub. Sur un message de Numo, mentionner son
   * compte de bot ne mènerait nulle part — un `@minddy-app[bot]` ne réveille
   * personne. C'est `@Numo` qu'on pose : la mention que minddy traite elle-même,
   * celle qui relance la passe. Répondre à Numo, c'est donc le rappeler, sans
   * avoir à savoir qu'il faut l'écrire.
   *
   * La citation suffit à dire à quoi on répond : depuis MIN-168, la relecture est
   * une SESSION qui lit tout le fil (et garde le sien en contexte) — l'id du
   * message cité, que l'ancienne passe recevait à part, n'apprenait plus rien.
   */
  const quoteReply = (body: string, login?: string | null) => {
    const quoted = body
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    const numo = isNumoComment(login);
    const mention = numo ? "@Numo " : login ? `@${login} ` : "";
    setCommentBody((d) => `${d.trim() ? `${d.trimEnd()}\n\n` : ""}${quoted}\n\n${mention}`);
    // Le composer n'est plus un `<textarea>` mais un champ à mentions (MIN-162) :
    // le curseur ne se pose pas par `setSelectionRange` mais sur ce signal, que
    // le champ lit APRÈS avoir reposé son contenu.
    setQuoteFocus((n) => n + 1);
  };

  const submitComment = async () => {
    const body = commentBody.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const { review } = await postPullRequestCommentApi(item.prId, body);
      setCommentBody("");
      await refetchComments();
      // Le message MENTIONNAIT Numo : sa passe est déjà ouverte côté serveur
      // (MIN-162). On va la chercher tout de suite — c'est ce qui fait
      // apparaître la carte vivante à la place du futur verdict, au lieu de
      // laisser une minute de silence pendant laquelle rien ne dit que le geste
      // a marché.
      if (review) await reviewSession.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPosting(false);
    }
  };

  // Le nom de cette page est l'identifiant de la PR — pas celui du ticket, qui
  // n'en est qu'une relation et se lit à sa droite. `pr_url` vient de la liste,
  // `pr.url` de la forge : l'identifiant EST le lien vers la forge, ce qui
  // remplace le « PR #30 ↗ » qui traînait sous le titre.
  const identifier = prIdentifier(item.provider, item.pr_number);
  const linkedIssue =
    item.issue && item.project
      ? issueIdentifier(item.project.key, item.issue.number)
      : null;
  const forgeUrl = pr?.url ?? item.pr_url;

  // Le poids de la PR, d'un coup d'œil : GitHub le met à côté du titre, et c'est
  // la première question qu'on se pose avant d'ouvrir l'onglet Fichiers.
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);

  // La liste connaît l'auteur (colonne `author_login`) ; la forge le confirme.
  // Elle gagne dès qu'elle a répondu — même arbitrage que pour l'état.
  const author = pr?.user ?? item.author;

  /**
   * « X veut fusionner 3 commits dans main depuis routine/audit » — la ligne que
   * GitHub pose sous le titre, et la seule qui dise les DEUX branches : jusqu'ici
   * minddy ne les affichait nulle part, alors que c'est ce qui répond à « ça part
   * où, ça vient d'où ? » avant de fusionner.
   *
   * Le compte de commits vient de la forge quand elle le sert (GitHub le met dans
   * le GET d'une PR) ; sinon — GitLab — de la liste de commits déjà chargée pour
   * son onglet, et seulement si elle est ENTIÈRE : une liste tronquée annoncerait
   * un chiffre faux, et mieux vaut taire la phrase que mentir sur son chiffre.
   *
   * Le sujet est le nom de l'agent sur une PR de Numo : le compte de la forge y
   * est le bot de la GitHub App, que minddy ne montre jamais (règle d'identité).
   */
  const commitCount =
    pr?.commitCount ?? (commitsTruncated || commits.length === 0 ? null : commits.length);
  const mergeSummary: React.ReactNode =
    pr?.base && pr?.head && commitCount !== null && (item.runId || author)
      ? t.rich(item.pr_state === "merged" ? "mergedCommits" : "wantsToMerge", {
          login: item.runId ? t("numoAuthor") : parseForgeLogin(author?.login ?? "").name,
          count: commitCount,
          base: pr.base,
          head: pr.head,
          author: (chunks) => (
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              {chunks}
              {/* Le compte de la forge est un bot, et ce n'est pas Numo : la
                  pastille se pose sur le NOM, comme partout ailleurs. */}
              {!item.runId && author && parseForgeLogin(author.login).isBot ? <BotBadge /> : null}
            </span>
          ),
          branch: (chunks) => (
            <span className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
              {chunks}
            </span>
          ),
        })
      : null;

  // Corps GitHub de la PR, sans le suffixe auto « 🤖 Généré par l'agent numo… »
  // (redondant avec le badge « Généré par Numo »).
  const prDescription = (pr?.body ?? "").replace(/\n*🤖[^\n]*$/u, "").trim();

  // Le fil complet : messages ET activité, dans l'ordre où tout est arrivé.
  const feed = buildFeed(comments, timeline, reviewComments, commits);
  // Le compteur de l'onglet compte ce qui se LIT — messages et reviews qui
  // disent quelque chose — pas les lignes d'activité, qui sont du contexte.
  const conversationCount = feed.filter((e) => e.kind !== "event").length;

  return (
    // L'enveloppe dit à TOUT le panneau — corps, fil, activité, remarques de
    // ligne, composers — de quelle PR il parle : par quel proxy passer pour
    // afficher une image de la forge, et à quelles routes demander les comptes
    // mentionnables et l'hébergement d'une pièce jointe (MIN-162).
    <PrEndpointProvider endpoint={prEndpoint(item.prId)}>
    <div className="flex h-full min-h-0 flex-col">
      {/* Header : retour (mobile) · identifiant · actions */}
      {/* En-tête SANS bordure : c'est le fondu du fil qui dit qu'il continue
          au-dessus, et une barre séparée le couperait de ce qu'il coiffe (même
          parti que la conversation d'agent). */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("backToList")}
          className="md:hidden"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
        {/* L'orbe du projet ouvre l'en-tête, comme celui d'une conversation de
            l'agent : la colonne ne dit plus le projet ligne par ligne (il est
            écrit une fois, sur l'en-tête de son accordéon), et le détail est
            l'endroit où l'on veut savoir de quel dépôt on parle. */}
        {item.project ? (
          <ProjectOrb
            seed={projectOrbSeed(item.project)}
            iconUrl={item.project.icon_url}
            className="size-4 shrink-0"
          />
        ) : null}
        <span className="flex min-w-0 items-center gap-1 font-mono text-sm">
          {forgeUrl ? (
            <a
              href={forgeUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-foreground outline-none hover:underline"
            >
              {identifier}
            </a>
          ) : (
            <span className="shrink-0 text-foreground">{identifier}</span>
          )}
          {linkedIssue ? (
            // Le chevron seul ne dit pas la relation : la survoler la nomme,
            // exactement comme « › MIN-42 » sur un sous-ticket.
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    if (item.issue && item.project) onOpenIssue(item.issue.id, item.project.id);
                  }}
                  className="flex min-w-0 items-center gap-1 text-muted-foreground outline-none hover:text-foreground hover:underline"
                >
                  <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{linkedIssue}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("linkedIssue")}</TooltipContent>
            </Tooltip>
          ) : item.project ? (
            // Non rattachée : c'est un ÉTAT NORMAL depuis MIN-143 (le lien vient
            // d'une convention `MIN-42` dans la branche, le titre ou une ligne
            // Fixes — pas d'une devinette). Reste que la convention se rate, et
            // que rien ne savait alors poser le lien après coup : le sélecteur
            // prend la place exacte du ticket manquant (MIN-163).
            <PrLinkIssue
              prId={item.prId}
              prState={item.pr_state}
              projectId={item.project.id}
              projectKey={item.project.key}
              onLinked={() => {
                onRefetchList();
                void refetchPr();
              }}
            />
          ) : (
            // Aucun projet résolu pour ce dépôt : il n'y a pas de périmètre de
            // tickets à proposer. On dit l'état plutôt que d'offrir un menu vide.
            <span className="font-sans text-xs text-muted-foreground/70">
              {t("noLinkedIssue")}
            </span>
          )}
        </span>
        {/* Tant que la PR est VIVANTE, son état se lit à gauche, contre
            l'identifiant : la droite appartient aux actions, qui sont ce qu'on y
            cherche. Terminée (fusionnée, fermée), c'est l'inverse — l'état DEVIENT
            la nouvelle, et il va prendre la place des actions, à la fin de la
            ligne (voir la grappe de droite plus bas). */}
        {!isTerminal ? <PrStateBadge state={badgeState} icon /> : null}
        {/* Approbations : « n approbations », et la mention du blocage à côté du
            bouton Fusionner. Pas de « n/N » — le N vient de la protection de
            branche, qui coûte une permission GitHub hors périmètre. */}
        {reviews && reviews.approvals > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-500">
            <Check className="size-3.5" />
            {t("approvals", { count: reviews.approvals })}
          </span>
        ) : null}
        {reviews && reviews.changesRequested > 0 ? (
          <span className="text-xs text-amber-600 dark:text-amber-500">
            {t("changesRequestedCount", { count: reviews.changesRequested })}
          </span>
        ) : null}
        {isWorking ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner />
            {t("numoWorking")}
          </span>
        ) : null}

        {isTerminal ? (
          // Fin de ligne d'une PR terminée : le seul geste qui lui reste — rouvrir,
          // sans confirmation, ça ne détruit rien et le bouton d'à côté la referme
          // — puis son ÉTAT, en dernier. Le badge ferme la ligne dans les deux cas,
          // fusionnée (rien avant lui) comme fermée (le bouton avant lui) : c'est
          // toujours au même endroit qu'on lit ce qu'elle est devenue.
          <div className="ml-auto flex items-center gap-1.5">
            {canReopen ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void act("reopen")}
                disabled={!!acting}
              >
                {acting === "reopen" ? <Spinner /> : <RotateCcw />}
                {t("reopen")}
              </Button>
            ) : null}
            <PrStateBadge state={badgeState} icon />
          </div>
        ) : (
          // Quatre boutons côte à côte tiennent sur un écran large et débordaient
          // du téléphone : la grappe ne rétrécit pas (un libellé ne se coupe
          // pas), elle poussait donc hors de l'écran. Elle RETOMBE à la ligne
          // (`flex-wrap`) plutôt que de déborder, et sous `lg` tout ce qui n'est
          // pas le geste principal — fusionner, ou proposer — passe sous un
          // « … ». Ce qui reste visible est ce pour quoi on ouvre une PR sur son
          // téléphone ; le reste est à un tap.
          //
          // Le seuil est `lg`, pas `md` : à `md` la page est DÉJÀ en deux
          // colonnes, et le détail n'a que ce que la liste (320 px) et le rail
          // lui laissent — la ligne complète y déborderait encore. Au-delà, elle
          // tient, quitte à s'écrire sur deux lignes.
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            {mergeBlockedByRepo ? (
              <span className="text-xs text-muted-foreground">{t("mergeBlockedByRepo")}</span>
            ) : null}

            {/* ── Écran large : chaque geste porte son nom ─────────────────── */}
            <div className="hidden items-center gap-1.5 lg:flex">
              {/* « Demander des changements » a QUITTÉ le menu : c'est le seul
                  geste de review qui ne se contente pas de parler — il peut faire
                  travailler Numo —, et cette moitié-là ne demande AUCUNE identité
                  git. L'enterrer sous un chevron réservé aux comptes connectés
                  faisait perdre l'action à ceux qui n'ont justement qu'elle. Le
                  dialogue s'adapte : avec un compte, le verdict part aussi. */}
              <Button variant="outline" size="sm" onClick={() => openReview("request_changes")}>
                <NumoIcon animated={false} />
                {t("reviewRequestChanges")}
              </Button>

              {/* Review — les verdicts qui ne font que PARLER (approuver,
                  commenter), donc réservés à qui a un compte git pour les signer ;
                  puis la relecture par Numo (MIN-141), séparée parce qu'elle ne
                  demande rien et part au clic.

                  « Faire vérifier par Numo » RESTE quel que soit le compte git :
                  c'est un geste d'AGENT, il ne dépend d'aucune identité humaine.
                  Quand c'est la seule entrée qui survit, le menu à une entrée
                  devient un bouton simple — un chevron qui n'ouvre qu'une ligne
                  est une fausse promesse. */}
              {canComment ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {aiReviewActive ? <Spinner /> : null}
                      {t("review")}
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => openReview("approve")}>
                      <Check />
                      {t("reviewApprove")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openReview("comment")}>
                      <MessageSquare />
                      {t("reviewComment")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      // Déjà relu ce diff, ou une passe en cours : l'entrée reste
                      // VISIBLE et se grise, avec son libellé qui dit pourquoi.
                      disabled={aiReviewActive || reviewUpToDate}
                      onSelect={openAiReviewDialog}
                    >
                      <NumoIcon animated={false} />
                      {aiReviewLabel}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={aiReviewActive || reviewUpToDate}
                  onClick={openAiReviewDialog}
                >
                  {aiReviewActive ? <Spinner /> : <NumoIcon animated={false} />}
                  {/* Mêmes quatre libellés que l'entrée du menu : c'est le MÊME
                      geste, et c'est ici la seule affordance de qui n'a pas de
                      compte git — elle ne doit pas en dire moins. */}
                  {aiReviewLabel}
                </Button>
              )}

              {canWrite ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction({ kind: "close" })}
                  disabled={!!acting || isWorking}
                >
                  {acting === "close" ? <Spinner /> : <X />}
                  {t("close")}
                </Button>
              ) : null}
            </div>

            {/* ── Écran étroit : les mêmes gestes, sous un « … » ───────────── */}
            {/* Un seul menu à plat, dans l'ordre de la ligne large : demander des
                changements, les verdicts qui parlent (si compte git), la
                relecture de Numo, puis fermer, détaché parce qu'il termine la
                PR. Rien n'est retiré au passage — l'écran étroit perd la place,
                pas les actions. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="lg:hidden"
                  aria-label={t("moreActions")}
                >
                  {aiReviewActive ? <Spinner /> : <MoreHorizontal />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => openReview("request_changes")}>
                  <NumoIcon animated={false} />
                  {t("reviewRequestChanges")}
                </DropdownMenuItem>
                {canComment ? (
                  <>
                    <DropdownMenuItem onSelect={() => openReview("approve")}>
                      <Check />
                      {t("reviewApprove")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openReview("comment")}>
                      <MessageSquare />
                      {t("reviewComment")}
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuItem
                  disabled={aiReviewActive || reviewUpToDate}
                  onSelect={openAiReviewDialog}
                >
                  <NumoIcon animated={false} />
                  {aiReviewLabel}
                </DropdownMenuItem>
                {canWrite ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={!!acting || isWorking}
                      onSelect={() => setConfirmAction({ kind: "close" })}
                    >
                      <X />
                      {t("close")}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            {!canWrite ? null : isDraft ? (
              // Une PR brouillon ne se fusionne pas : le geste qu'elle appelle est
              // de la proposer.
              <Button
                size="sm"
                onClick={() => void act("ready_for_review")}
                disabled={!!acting || isWorking}
              >
                {acting === "ready_for_review" ? <Spinner /> : <Send />}
                {t("readyForReview")}
              </Button>
            ) : (
              <div className="flex items-center">
                {checksFailing ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button size="sm" className="rounded-r-none" disabled>
                          <Check />
                          {t("merge")}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t("mergeBlockedByChecks")}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    size="sm"
                    className={cn(
                      (otherMethods.length > 0 || checksFailing) && "rounded-r-none",
                    )}
                    onClick={() => setConfirmAction({ kind: "merge", method: "squash" })}
                    disabled={!!acting || isWorking}
                  >
                    {acting === "merge" ? <Spinner /> : <Check />}
                    {t("merge")}
                  </Button>
                )}
                {otherMethods.length > 0 || checksFailing ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        aria-label={t("mergeMethodMenu")}
                        className="rounded-l-none border-l border-primary-foreground/20 px-2"
                        disabled={!!acting || isWorking}
                      >
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {mergeMethods.map((m) => (
                        <DropdownMenuItem
                          key={m}
                          // Sur CI rouge, seule l'entrée explicite « fusionner
                          // quand même » passe : choisir une méthode ne doit pas
                          // devenir un contournement discret du garde-fou.
                          disabled={checksFailing}
                          onSelect={() => setConfirmAction({ kind: "merge", method: m })}
                        >
                          {t(
                            m === "squash"
                              ? "mergeMethodSquash"
                              : m === "rebase"
                                ? "mergeMethodRebase"
                                : "mergeMethodMerge",
                          )}
                        </DropdownMenuItem>
                      ))}
                      {checksFailing ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() =>
                              setConfirmAction({ kind: "merge", method: "squash" })
                            }
                          >
                            {t("mergeAnyway")}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Le fondu s'ÉTEINT sous l'onglet Fichiers (MIN-182). Un masque délave
          tout ce qu'il contient, éléments collants compris : l'en-tête de
          fichier du diff devrait sinon s'arrêter 2rem plus bas pour rester net,
          et un en-tête qui flotte à 32 px du bord se voit. Le fondu dit « il y a
          du texte au-dessus » — l'en-tête collant le dit mieux, et en nommant le
          fichier. Sous les deux autres onglets il reste, il n'y a rien qui colle
          à protéger.

          `onScroll` continue de tourner : la mesure ne coûte rien et le fondu
          revient juste, sans transition ratée, dès qu'on change d'onglet. */}
      <div
        ref={feedFade.ref}
        onScroll={feedFade.scrollProps.onScroll}
        style={tab === "files" ? undefined : feedFade.scrollProps.style}
        // Le padding VERTICAL est descendu d'un cran, sur l'enveloppe (MIN-182).
        // Mesuré : `position: sticky` se cale sur le CONTENU du conteneur de
        // défilement, pas sur son bord — un `py-6` ici arrêtait l'en-tête de
        // fichier 24 px trop bas, et `scroll-padding-top: 0` n'y change rien.
        // Descendu, il défile avec le contenu et l'en-tête colle au bandeau.
        className="min-h-0 flex-1 overflow-y-auto px-4 md:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-6 py-6">
          {/* Titre de la PR + méta. Le TITRE de la pull request, et non celui du
              ticket : depuis MIN-143 elles ne vont plus par paires, et une PR
              humaine peut n'en avoir aucun. (Numo nomme les siennes
              « MIN-42: <titre du ticket> » — l'affichage ne change pas pour elles.) */}
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl leading-tight font-semibold">
              {pr?.title ?? item.title ?? item.issue?.title ?? identifier}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              {/* Badge « généré par Numo » : seulement si un run porte VRAIMENT
                  cette PR. La session est celle du ticket lié (/agents est indexé
                  par issue, tous les runs successifs y vivent) → le badge y mène.
                  Sur une PR humaine, c'est l'auteur qui prend cette place. */}
              {item.runId ? (
                item.issue ? (
                  <Link href={`/agents?issue=${item.issue.id}`}>
                    <Badge
                      variant="secondary"
                      icon={<NumoIcon animated={false} />}
                      className="h-6 transition-colors hover:bg-muted"
                    >
                      {t("generatedByNumo")}
                    </Badge>
                  </Link>
                ) : (
                  <Badge variant="secondary" icon={<NumoIcon animated={false} />} className="h-6">
                    {t("generatedByNumo")}
                  </Badge>
                )
              ) : author ? (
                <span className="inline-flex items-center gap-1.5">
                  <UserAvatar
                    url={author.avatar_url}
                    seed={author.login}
                    className="size-4"
                  />
                  {/* La phrase de fusion NOMME déjà l'auteur (« X veut fusionner
                      3 commits dans main… ») : redire « Ouverte par X » juste à
                      côté ferait doublon. Le repli garde le nom seul, tant que
                      les branches ou le compte de commits manquent — la phrase
                      finit alors par le login dans les deux langues, et la
                      pastille de bot se pose après elle, pas au milieu. */}
                  {mergeSummary ?? (
                    <>
                      {t("openedBy", { login: parseForgeLogin(author.login).name })}
                      {parseForgeLogin(author.login).isBot ? <BotBadge /> : null}
                    </>
                  )}
                </span>
              ) : null}
              {/* PR de Numo : le badge a pris la place de l'auteur, la phrase se
                  pose donc à côté — c'est elle qui porte les branches. */}
              {item.runId && mergeSummary ? <span>{mergeSummary}</span> : null}
              {item.project ? (
                <span className="inline-flex items-center gap-1.5">
                  <ProjectOrb
                    seed={projectOrbSeed(item.project)}
                    iconUrl={item.project.icon_url}
                    className="size-3.5"
                  />
                  {item.project.name}
                </span>
              ) : null}
              {/* Le diff en un chiffre, à la place qu'occupait « PR #30 ↗ » —
                  l'identifiant, lui, est monté dans l'en-tête, où il est
                  cliquable vers la forge. Muet tant que les fichiers n'ont pas
                  répondu : « +0 −0 » se lirait comme une PR vide. */}
              {files.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                  <span className="text-green-700 dark:text-green-500">
                    +{format.number(additions)}
                  </span>
                  <span className="text-red-700 dark:text-red-500">
                    −{format.number(deletions)}
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          {/* Checks CI — sous l'en-tête, avant le fil : c'est ce qu'on regarde
              avant de décider de fusionner. */}
          {!loading ? (
            <ChecksBanner checks={checks} error={checksError} provider={item.provider} />
          ) : null}

          {/* L'unique endroit où se dit « sous quel compte git vous agissez »
              (MIN-144). Muet quand tout va bien. */}
          {!loading ? <PrViewerCallout viewer={viewer} repoUrl={pr?.url} /> : null}

          {/* Onglets façon GitHub : le fil d'un côté, le code de l'autre. */}
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as "activity" | "commits" | "files")}
          >
            <TabsList variant="line" className={TAB_LIST_DENSE}>
              <TabsTrigger value="activity" className={cn(TAB_TRIGGER_DENSE, "gap-1.5")}>
                {t("tabActivity")}
                {conversationCount > 0 ? (
                  <span className="text-xs text-muted-foreground">{conversationCount}</span>
                ) : null}
              </TabsTrigger>
              {/* Les commits AVANT les fichiers, comme sur GitHub : on lit ce qui
                  compose la PR avant d'entrer dans le code qu'elle change. */}
              <TabsTrigger value="commits" className={cn(TAB_TRIGGER_DENSE, "gap-1.5")}>
                {t("tabCommits")}
                {commits.length > 0 ? (
                  <span className="text-xs text-muted-foreground">{commits.length}</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="files" className={cn(TAB_TRIGGER_DENSE, "gap-1.5")}>
                {t("tabFiles")}
                {files.length > 0 ? (
                  <span className="text-xs text-muted-foreground">{files.length}</span>
                ) : null}
              </TabsTrigger>
            </TabsList>

            {/* Fil : la description de la PR ouvre la discussion, les commentaires
                GitHub suivent, le composer ferme. */}
            <TabsContent value="activity" className="mt-4 flex flex-col gap-3">
              {loading || commentsLoading ? (
                <Skeleton className="h-16 rounded-lg" />
              ) : !prDescription && feed.length === 0 && !reviewCard ? (
                <p className="text-sm text-muted-foreground">{t("noComments")}</p>
              ) : (
                // Mêmes cartes que les commentaires d'issue (CommentCard) : bordure,
                // fond card, en-tête avatar/auteur/heure puis le corps markdown.
                // Les lignes d'activité s'intercalent entre elles, sans carte.
                <ul className="flex flex-col gap-3">
                  {prDescription ? (
                    <ThreadComment
                      // Le corps de la PR n'est pas un commentaire, mais il se
                      // réagit comme un : le serveur traduit ce zéro dans le
                      // sujet qu'attend chaque forge.
                      commentId={PR_BODY_COMMENT_ID}
                      user={pr?.user ?? null}
                      createdAt={pr?.createdAt ?? null}
                      body={prDescription}
                      // Citer alimente le composer du bas : sans compte git il
                      // n'y en a pas, et le geste ne mènerait nulle part.
                      onQuoteReply={
                        canComment
                          ? () => quoteReply(prDescription, pr?.user?.login)
                          : undefined
                      }
                      reactions={threadReactions}
                    />
                  ) : null}
                  {feed.map((entry) => {
                    if (entry.kind === "event") {
                      return <PrTimelineRow key={entry.key} event={entry.event} />;
                    }
                    if (entry.kind === "review") {
                      return (
                        <PrTimelineReview
                          key={entry.key}
                          event={entry.event}
                          comments={entry.comments}
                        />
                      );
                    }
                    const c = entry.comment;
                    return (
                      <ThreadComment
                        key={entry.key}
                        commentId={c.id}
                        user={c.user}
                        createdAt={c.created_at}
                        body={c.body}
                        onQuoteReply={
                          canComment
                            ? () => quoteReply(c.body ?? "", c.user?.login)
                            : undefined
                        }
                        quotingNumo={isNumoComment(c.user?.login)}
                        reactions={threadReactions}
                      />
                    );
                  })}
                  {/* La session de relecture, à la place où son verdict tombe —
                      et cliquable : c'est par là qu'on va voir ce que l'agent a
                      lu, et qu'on lui répond. */}
                  {reviewCard ? <PrReviewCard run={reviewCard} /> : null}
                </ul>
              )}

            </TabsContent>

            <TabsContent value="commits" className="mt-4">
              <PrCommits
                prId={item.prId}
                commits={commits}
                truncated={commitsTruncated}
                loading={commitsLoading}
                provider={item.provider}
              />
            </TabsContent>

            <TabsContent value="files" className="mt-4">
              {loading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-40 rounded-md" />
                </div>
              ) : pr ? (
                <PrDiff
                  files={files}
                  endpoint={prEndpoint(item.prId)}
                  prUrl={pr.url}
                  provider={item.provider}
                  // Deux droits distincts (MIN-144) : commenter une ligne
                  // demande `read`, résoudre un fil est une écriture sur le
                  // dépôt. Les confondre offrirait « Résoudre » pour un 403.
                  readOnly={!canComment}
                  canResolve={canWrite}
                  reviewComments={reviewComments}
                  reviewThreads={reviewThreads}
                  reviewReactions={reviewReactions}
                  onCommentPosted={refetchReviewComments}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t("prUnavailable")}</p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Composer — mentions de comptes de forge, pièces jointes, aperçu
          markdown (MIN-162).

          HORS de la zone qui défile, et non au bout du fil : sur une PR bavarde,
          un composer posé après le dernier message se gagne au scroll, et on le
          reperd dès qu'on remonte lire ce à quoi on voulait répondre. Épinglé en
          pied, il est là où le fil de discussion se répond — c'est déjà ce que
          fait le panneau de ticket (`SidePanelFooter`).

          Seulement sous l'onglet du FIL : il n'y a rien à commenter en face
          d'une liste de commits, et l'onglet Fichiers a ses propres champs,
          ancrés à leur ligne. ABSENT sans compte git : le message partirait sous
          l'identité du bot (MIN-144).

          `dock-above-nav` : sur mobile il se pose juste au-dessus de la barre
          flottante, donc dans le dégradé qu'elle projette — la classe l'en sort
          (cf. globals.css). */}
      {tab === "activity" && canComment ? (
        <div className="dock-above-nav shrink-0 bg-background px-4 py-3 md:px-6">
          {/* Même colonne que le fil au-dessus : un composer pleine largeur ne
              serait plus en face de ce à quoi il répond. */}
          <div className="mx-auto max-w-3xl">
            <PrCommentComposer
              endpoint={prEndpoint(item.prId)}
              value={commentBody}
              onChange={setCommentBody}
              onSubmit={() => void submitComment()}
              posting={posting}
              placeholder={t("commentPlaceholder")}
              submitLabel={t("postComment")}
              focusSignal={quoteFocus}
            />
          </div>
        </div>
      ) : null}

      {/* Confirmation fusionner / refuser */}
      <Dialog
        open={!!confirmAction}
        onOpenChange={(next) => {
          if (!next && !acting) setConfirmAction(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.kind === "merge" ? t("confirmMergeTitle") : t("confirmCloseTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmAction?.kind === "merge"
              ? t("confirmMergeDescription")
              : t("confirmCloseDescription")}
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={!!acting} onClick={() => setConfirmAction(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant={confirmAction?.kind === "close" ? "destructive" : "default"}
              disabled={!!acting}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.kind === "merge") void act("merge", confirmAction.method);
                else void act("close");
              }}
            >
              {acting ? <Spinner /> : null}
              {confirmAction?.kind === "merge" ? t("merge") : t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* « Faire vérifier par Numo » — le seul choix à faire est le modèle, et
          il se fait ICI, au clic : le défaut de l'instance convient la plupart
          du temps, une grosse PR mérite parfois mieux. Le choix est retenu pour
          la prochaine fois ; « défaut de minddy » l'efface. */}
      <Dialog
        open={aiReviewDialog}
        onOpenChange={(next) => {
          if (!next && !startingAiReview) setAiReviewDialog(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("aiReview")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("numoReviewDialogDescription")}</p>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t("numoReviewModelLabel")}</span>
            <ModelCombobox
              // Catalogue de la clé plateforme, filtré tool-calling : la review
              // tourne dessus quel que soit le BYOK du compte (`review`).
              scope="review"
              value={aiReviewModel}
              onChange={setAiReviewModel}
              defaultLabel={t("numoReviewModelInstance")}
              defaultModelId={reviewSession.model?.instance ?? null}
              placeholder={tAgent("modelSearchPlaceholder")}
              emptyLabel={tAgent("modelSearchEmpty")}
              loadingLabel={tAgent("modelSearchLoading")}
              freeTextLabel={(q) => tAgent("modelUseCustom", { model: q })}
              disabled={startingAiReview}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={startingAiReview}
              onClick={() => setAiReviewDialog(false)}
            >
              {t("cancel")}
            </Button>
            <Button disabled={startingAiReview} onClick={() => void startAiReview()}>
              {startingAiReview ? <Spinner /> : <NumoIcon animated={false} />}
              {t("numoReviewStart")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue de review — les trois verdicts partagent le même formulaire ;
          seule la case « et relancer Numo » distingue la demande de changements. */}
      <Dialog
        open={!!reviewVerdict}
        onOpenChange={(next) => {
          if (!next && !submitting) setReviewVerdict(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t(
                reviewVerdict === "approve"
                  ? "reviewApproveTitle"
                  : reviewVerdict === "comment"
                    ? "reviewCommentTitle"
                    : "reviewRequestChangesTitle",
              )}
            </DialogTitle>
          </DialogHeader>
          {/* Les deux modes d'une demande de changements. Le second existe
              parce que la consigne est presque toujours la MÊME — « reprends ce
              qu'on t'a écrit et corrige-le » — et qu'on la retapait à la main
              alors que les remarques sont déjà sur la PR, lisibles par l'agent.
              Absents des deux autres verdicts : approuver et commenter ne font
              que parler, ils n'ont qu'un mode. */}
          {reviewVerdict === "request_changes" ? (
            <Tabs
              value={reviewMode}
              onValueChange={(v) => switchReviewMode(v as "write" | "findings")}
            >
              <TabsList className="w-full">
                <TabsTrigger value="write" className="flex-1">
                  {t("reviewModeWrite")}
                </TabsTrigger>
                {canRelaunch ? (
                  <TabsTrigger value="findings" className="flex-1">
                    {t("reviewModeFindings")}
                  </TabsTrigger>
                ) : (
                  // Numo n'a jamais poussé sur cette PR : il n'a pas de branche à
                  // reprendre, donc rien à y corriger. Désactivé AVEC sa raison —
                  // un onglet muet laisserait chercher.
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="flex-1">
                        <TabsTrigger value="findings" disabled className="w-full">
                          {t("reviewModeFindings")}
                        </TabsTrigger>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {t("reviewFindingsUnavailable")}
                    </TooltipContent>
                  </Tooltip>
                )}
              </TabsList>
            </Tabs>
          ) : null}

          <Textarea
            value={reviewMessage}
            onChange={(e) => setReviewMessage(e.target.value)}
            // Même raccourci que les autres composers de l'app, réglage de
            // compte compris : ⌘/Ctrl+Entrée envoie (ou Entrée seule), Maj+Entrée
            // passe à la ligne. Le bouton n'est atteignable que si la review a de
            // quoi partir — la garde est la sienne, relue ici.
            onKeyDown={(e) => {
              if (!isSend(e)) return;
              e.preventDefault();
              if (!reviewSubmitDisabled) void submitReview();
            }}
            placeholder={t(
              reviewVerdict === "approve" ? "reviewApprovePlaceholder" : "reviewPlaceholder",
            )}
            rows={reviewMode === "findings" ? 5 : 4}
            autoFocus
            className="resize-none bg-card"
          />

          {/* Ce que ce mode fait VRAIMENT, dit une fois : le texte est une
              consigne pour Numo, pas une review — rien ne part sous votre nom. */}
          {reviewVerdict === "request_changes" && reviewMode === "findings" ? (
            <p className="text-xs text-muted-foreground">{t("reviewFindingsHint")}</p>
          ) : null}

          {/* Sans compte git, le verdict n'a personne pour le signer (MIN-144) :
              seule la relance part. Le dire ici plutôt que de laisser croire à
              une review publiée. */}
          {reviewVerdict === "request_changes" && reviewMode === "write" && !canComment ? (
            <p className="text-xs text-muted-foreground">{t("reviewNoVerdictHint")}</p>
          ) : null}

          {/* Le geste que minddy a et que GitHub n'a pas : la demande de
              changements peut relancer Numo sur cette même PR (MIN-68).
              ABSENT sur une PR sans run (MIN-143) : Numo hérite du travail par
              les runs PRÉCÉDENTS de cette lignée — son ticket, ou la PR
              elle-même quand elle n'en a pas (MIN-292) —, et une PR humaine n'en
              a aucun : il repartirait d'une branche neuve au lieu de reprendre
              celle-ci. Le geste est masqué plutôt que cassé. */}
          {reviewVerdict === "request_changes" && reviewMode === "write" && canRelaunch ? (
            item.busyRunId ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="flex items-center gap-2">
                    <Checkbox checked={false} disabled />
                    <span className="text-sm text-muted-foreground">
                      {t("reviewRelaunchNumo")}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">{tAgent("errorAlreadyRunning")}</TooltipContent>
              </Tooltip>
            ) : (
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={relaunch}
                  onCheckedChange={(v) => setRelaunch(v === true)}
                  disabled={submitting}
                />
                <span className="text-sm">{t("reviewRelaunchNumo")}</span>
              </label>
            )
          ) : null}

          {/* Le pied porte TROIS choses quand la relance est cochée — le modèle,
              annuler, envoyer —, et le dialogue fait 28rem : sur un nom de modèle
              un peu long, la ligne débordait au lieu de se replier. Elle se replie
              donc (`flex-wrap`), et c'est `ml-auto` qui tient les boutons à droite
              — `justify-between` les ramenait à gauche dès que le combobox passait
              seul sur sa ligne. */}
          <DialogFooter className="sm:flex-wrap">
            {/* Nouvelle run = nouveau choix de modèle (identique à un premier
                lancement) ; vide = le modèle par défaut du compte. */}
            {reviewVerdict === "request_changes" && relaunching ? (
              <ModelCombobox
                variant="compact"
                value={model}
                onChange={setModel}
                defaultLabel={tAgent("modelDefault")}
                defaultModelId={defaultModel ?? providerDefaultModel}
                placeholder={tAgent("modelSearchPlaceholder")}
                emptyLabel={tAgent("modelSearchEmpty")}
                loadingLabel={tAgent("modelSearchLoading")}
                freeTextLabel={(q) => tAgent("modelUseCustom", { model: q })}
                disabled={submitting}
              />
            ) : null}
            <div className="flex items-center gap-2 sm:ml-auto">
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => setReviewVerdict(null)}
              >
                {t("cancel")}
              </Button>
              <SendShortcutTooltip label={reviewSubmitLabel}>
                <Button
                  disabled={reviewSubmitDisabled}
                  onClick={() => void submitReview()}
                >
                  {submitting ? <Spinner /> : null}
                  {reviewSubmitLabel}
                </Button>
              </SendShortcutTooltip>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PrEndpointProvider>
  );
}
