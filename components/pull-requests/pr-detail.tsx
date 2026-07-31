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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GitPullRequest,
  MessageSquare,
  Reply,
  Send,
  X,
} from "lucide-react";
import Link from "next/link";
import { AutoTextarea } from "@/components/auto-textarea";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { Markdown } from "@/components/markdown";
import { NumoIcon } from "@/components/numo-icon";
import { ProjectOrb } from "@/components/project-orb";
import { PrDiff } from "@/components/pull-requests/pr-diff";
import { UserAvatar } from "@/components/user-avatar";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import {
  usePullRequestQuery,
  usePrCommentsQuery,
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
  type PullRequestListItem,
  type ReviewVerdict,
} from "@/lib/agent-api";
import { issueIdentifier } from "@/lib/issue-constants";

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

function stateBadgeVariant(
  state: PullRequestListItem["pr_state"],
): "default" | "secondary" | "destructive" | "outline" {
  if (state === "merged") return "default";
  if (state === "closed") return "destructive";
  if (state === "draft") return "outline";
  return "secondary";
}

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
 * Bandeau de checks CI. Replié il tient en une ligne (« 3/4 réussis ») ; déplié
 * il liste chaque check avec son lien chez la forge.
 *
 * Trois « pas de checks » différents, et ils ne se disent pas pareil :
 * `error` = on n'a pas pu lire (permission de la GitHub App non acceptée par
 * l'installation), `total === 0` = ce dépôt n'a pas de CI, et le cas normal.
 */
function ChecksBanner({
  checks,
  error,
}: {
  checks: ChecksSummary | null;
  error: "forbidden" | "unknown" | null;
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
        <ul className="flex flex-col border-t border-border">
          {checks.checks.map((c) => (
            <li key={c.name} className="flex items-center gap-2 px-3.5 py-2 text-sm">
              <CheckDot state={c.state} />
              <span className="min-w-0 truncate">{c.name}</span>
              {c.url ? (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto shrink-0 text-brand hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Une entrée du fil : avatar, auteur, heure, corps markdown. Sert autant à la
 * description de la PR (le commentaire qui OUVRE le fil) qu'aux commentaires qui
 * suivent — côté GitHub c'est la même chose, et le fil ne se lit comme un fil que
 * si son premier message a la même forme que les autres.
 */
function ThreadComment({
  user,
  createdAt,
  body,
  onQuoteReply,
}: {
  user: { login: string; avatar_url: string | null } | null;
  createdAt: string | null;
  body: string;
  onQuoteReply: () => void;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const now = useNow();

  return (
    <li className="group/comment flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2">
        <UserAvatar
          url={user?.avatar_url}
          seed={user?.login ?? "?"}
          className="size-5"
        />
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {user?.login ?? "—"}
        </span>
        {createdAt ? (
          <span className="shrink-0 text-xs text-muted-foreground/80">
            {format.relativeTime(new Date(createdAt), now)}
          </span>
        ) : null}
        <span className="min-w-0 flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("quoteReply")}
              className="-my-1 size-6 rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/comment:opacity-100 focus-visible:opacity-100"
              onClick={onQuoteReply}
            >
              <Reply className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{t("quoteReply")}</TooltipContent>
        </Tooltip>
      </div>
      <Markdown className="text-foreground [&_code]:bg-primary/10 [&_code]:text-primary [&_pre_code]:text-inherit">
        {body}
      </Markdown>
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
  const { defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const { defaultModel } = useAgentPreferencesQuery();

  const {
    pr,
    files,
    checks,
    checksError,
    reviews,
    mergeMethods,
    loading,
    refetch: refetchPr,
  } = usePullRequestQuery(item.prId, true);
  const { comments, loading: commentsLoading, refetch: refetchComments } = usePrCommentsQuery(
    item.prId,
  );
  const { comments: reviewComments, refetch: refetchReviewComments } = usePrReviewCommentsQuery(
    prEndpoint(item.prId),
  );

  const [acting, setActing] = useState<null | "merge" | "close" | "ready_for_review">(null);
  // Le merge se confirme AVEC sa méthode : la porter dans l'état de confirmation
  // évite qu'un clic sur « fusionner quand même » retombe sur le squash par défaut.
  const [confirmAction, setConfirmAction] = useState<
    null | { kind: "merge"; method?: MergeMethod } | { kind: "close" }
  >(null);
  const [reviewVerdict, setReviewVerdict] = useState<ReviewVerdict | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [relaunch, setRelaunch] = useState(true);
  // Modèle de la run à lancer — vide = le défaut du compte (MIN-68 : relancer Numo
  // est un lancement à froid, il a donc son propre choix de modèle).
  const [model, setModel] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  // Numo relit la PR (MIN-141) : un appel modèle, donc long — le bouton Review
  // porte le spinner, comme les autres gestes de la barre.
  const [aiReviewing, setAiReviewing] = useState(false);
  const [tab, setTab] = useState<"conversation" | "files">("conversation");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const isWorking = !!item.activeRunId;
  // « Et relancer Numo » n'existe que si un run porte déjà cette PR : c'est de
  // SES runs que la nouvelle hérite la branche (MIN-143). Une PR humaine, ou un
  // ticket dont la PR n'a jamais été ouverte par Numo, n'a rien à hériter.
  const canRelaunch = !!item.runId && !!item.issue;
  // `item` vient de la liste (valeur DB, éventuellement en retard d'un webhook),
  // `pr` du GET de la forge (la vérité) : la forge gagne dès qu'elle a répondu.
  const isDraft = pr?.draft ?? item.pr_state === "draft";
  const stateKey =
    item.pr_state === "merged"
      ? "stateMerged"
      : item.pr_state === "closed"
        ? "stateClosed"
        : isDraft
          ? "stateDraft"
          : "stateOpen";
  const isTerminal = item.pr_state === "merged" || item.pr_state === "closed";
  const badgeState = isDraft && !isTerminal ? "draft" : item.pr_state;
  // Une CI rouge ne bloque le merge que dans minddy : GitHub le laisse passer si
  // la branche n'est pas protégée, d'où l'échappatoire « fusionner quand même ».
  const checksFailing = checks?.state === "failure";
  const mergeBlockedByRepo = pr?.mergeableState === "blocked";
  // Le squash reste l'action principale (c'est ce que minddy fait depuis MIN-46) ;
  // le chevron n'offre que ce que la forge accepte réellement.
  const otherMethods = mergeMethods.filter((m) => m !== "squash");

  // Quand Numo termine (le run actif disparaît de la liste), rafraîchir diff +
  // commentaires. Les commentaires de ligne en font partie : Numo peut y avoir
  // répondu, et un nouveau push change les lignes auxquelles ils s'ancrent.
  const prevWorking = useRef(isWorking);
  useEffect(() => {
    if (prevWorking.current && !isWorking) {
      void refetchPr();
      void refetchComments();
      void refetchReviewComments();
    }
    prevWorking.current = isWorking;
  }, [isWorking, refetchPr, refetchComments, refetchReviewComments]);

  const act = async (action: "merge" | "close" | "ready_for_review", method?: MergeMethod) => {
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
    // La relance n'a de sens que sur une demande de changements, et c'est là son
    // comportement attendu : cochée d'office.
    setRelaunch(verdict === "request_changes" && canRelaunch);
  };

  const submitReview = async () => {
    if (!reviewVerdict || submitting) return;
    const message = reviewMessage.trim();
    // Approuver sans un mot est légitime ; commenter ou demander des changements
    // sans rien dire ne l'est pas (et les deux forges refusent un corps vide).
    if (!message && reviewVerdict !== "approve") return;
    setSubmitting(true);
    try {
      const result = await submitPullRequestReviewApi(item.prId, {
        verdict: reviewVerdict,
        message,
        relaunch: canRelaunch && relaunch && reviewVerdict === "request_changes",
        model: model || undefined,
      });
      // La forge a refusé de publier le verdict (une App ne peut pas approuver sa
      // propre PR) : il est parti en commentaire, et minddy le garde de son côté.
      // Le dire, plutôt que de laisser croire à une pastille verte sur GitHub.
      toast.success(
        result.published === "comment" ? t("selfReviewBlocked") : t("reviewSubmittedToast"),
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
   * Une fois la passe finie, les deux surfaces où elle atterrit sont
   * rafraîchies : la synthèse est un commentaire du fil, les points sont des
   * commentaires de ligne dans l'onglet Fichiers.
   */
  const requestAiReview = async () => {
    if (aiReviewing) return;
    setAiReviewing(true);
    // Un tour de modèle sur un diff entier prend de longues secondes : le
    // spinner du bouton dit qu'il se passe quelque chose, le toast dit QUOI.
    toast.info(t("aiReviewStarted"));
    try {
      const result = await requestPullRequestAiReviewApi(item.prId);
      toast.success(
        result.inlineComments > 0
          ? t("aiReviewDoneWithComments", { count: result.inlineComments })
          : t("aiReviewDone"),
      );
      await Promise.all([refetchComments(), refetchReviewComments(), refetchPr()]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAiReviewing(false);
    }
  };

  // Le fil d'une PR est PLAT côté GitHub (endpoint issues/{n}/comments : aucun
  // in_reply_to — seuls les commentaires de review ancrés au code sont threadés).
  // « Répondre » cite donc le message dans le composer du bas, comme le fait le
  // « Quote reply » de GitHub, et mentionne son auteur pour garder le fil lisible.
  const quoteReply = (body: string, login?: string | null) => {
    const quoted = body
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    const mention = login ? `@${login} ` : "";
    setCommentBody((d) => `${d.trim() ? `${d.trimEnd()}\n\n` : ""}${quoted}\n\n${mention}`);
    // Après le rendu de la nouvelle valeur : focus, curseur à la fin (après la mention).
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const submitComment = async () => {
    const body = commentBody.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      await postPullRequestCommentApi(item.prId, body);
      setCommentBody("");
      await refetchComments();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPosting(false);
    }
  };

  const identifier = item.issue && item.project
    ? issueIdentifier(item.project.key, item.issue.number)
    : `#${item.pr_number}`;

  // La liste connaît l'auteur (colonne `author_login`) ; la forge le confirme.
  // Elle gagne dès qu'elle a répondu — même arbitrage que pour l'état.
  const author = pr?.user ?? item.author;

  // Corps GitHub de la PR, sans le suffixe auto « 🤖 Généré par l'agent numo… »
  // (redondant avec le badge « Généré par Numo »).
  const prDescription = (pr?.body ?? "").replace(/\n*🤖[^\n]*$/u, "").trim();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header : retour (mobile) · identifiant · actions */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("backToList")}
          className="md:hidden"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
        {item.issue && item.project ? (
          <button
            type="button"
            onClick={() => {
              if (item.issue && item.project) onOpenIssue(item.issue.id, item.project.id);
            }}
            className="font-mono text-sm text-muted-foreground outline-none hover:text-foreground hover:underline"
          >
            {identifier}
          </button>
        ) : (
          <>
            <span className="font-mono text-sm text-muted-foreground">{identifier}</span>
            {/* Non rattachée : c'est un ÉTAT NORMAL depuis MIN-143 (le lien vient
                d'une convention `MIN-42` dans la branche, le titre ou une ligne
                Fixes — pas d'une devinette), mais il vaut mieux le dire que
                laisser un blanc là où l'œil cherche un ticket. */}
            <span className="text-xs text-muted-foreground/70">{t("noLinkedIssue")}</span>
          </>
        )}
        {/* Une PR terminale n'a plus d'actions : le badge prend la place qu'elles
            occupaient à droite, là où l'œil cherchait le bouton. Tant qu'elle est
            ouverte il reste à gauche, contre l'identifiant. */}
        <Badge
          variant={stateBadgeVariant(badgeState)}
          icon={<GitPullRequest />}
          className={cn(isTerminal && "ml-auto")}
        >
          {t(stateKey)}
        </Badge>
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

        {!isTerminal ? (
          <div className="ml-auto flex items-center gap-1.5">
            {mergeBlockedByRepo ? (
              <span className="text-xs text-muted-foreground">{t("mergeBlockedByRepo")}</span>
            ) : null}

            {/* Review — les trois verdicts, chacun ouvrant le même dialogue,
                puis la review de Numo (MIN-141), séparée parce qu'elle ne
                demande rien et part au clic. */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={aiReviewing}>
                  {aiReviewing ? <Spinner /> : null}
                  {t("review")}
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => openReview("approve")}>
                  <Check />
                  {t("reviewApprove")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openReview("request_changes")}>
                  <NumoIcon animated={false} />
                  {t("reviewRequestChanges")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openReview("comment")}>
                  <MessageSquare />
                  {t("reviewComment")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void requestAiReview()}>
                  <NumoIcon animated={false} />
                  {t("aiReview")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmAction({ kind: "close" })}
              disabled={!!acting || isWorking}
            >
              {acting === "close" ? <Spinner /> : <X />}
              {t("reject")}
            </Button>

            {isDraft ? (
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
                  <DropdownMenu modal={false}>
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
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
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
                  {t("openedBy", { login: author.login })}
                </span>
              ) : null}
              {item.project ? (
                <span className="inline-flex items-center gap-1.5">
                  <ProjectOrb seed={item.project.id} className="size-3.5" />
                  {item.project.name}
                </span>
              ) : null}
              {pr ? (
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  <ExternalLink className="size-3" />
                  {t(item.provider === "gitlab" ? "mrNumber" : "prNumber", {
                    number: pr.number,
                  })}
                </a>
              ) : null}
            </div>
          </div>

          {/* Checks CI — sous l'en-tête, avant le fil : c'est ce qu'on regarde
              avant de décider de fusionner. */}
          {!loading ? <ChecksBanner checks={checks} error={checksError} /> : null}

          {/* Onglets façon GitHub : le fil d'un côté, le code de l'autre. */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as "conversation" | "files")}>
            <TabsList variant="line" className="justify-start p-0">
              <TabsTrigger value="conversation" className="gap-1.5">
                {t("tabConversation")}
                {comments.length > 0 ? (
                  <span className="text-xs text-muted-foreground">{comments.length}</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="files" className="gap-1.5">
                {t("tabFiles")}
                {files.length > 0 ? (
                  <span className="text-xs text-muted-foreground">{files.length}</span>
                ) : null}
              </TabsTrigger>
            </TabsList>

            {/* Fil : la description de la PR ouvre la discussion, les commentaires
                GitHub suivent, le composer ferme. */}
            <TabsContent value="conversation" className="mt-4 flex flex-col gap-3">
              {loading || commentsLoading ? (
                <Skeleton className="h-16 rounded-lg" />
              ) : !prDescription && comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noComments")}</p>
              ) : (
                // Mêmes cartes que les commentaires d'issue (CommentCard) : bordure,
                // fond card, en-tête avatar/auteur/heure puis le corps markdown.
                <ul className="flex flex-col gap-3">
                  {prDescription ? (
                    <ThreadComment
                      user={pr?.user ?? null}
                      createdAt={pr?.createdAt ?? null}
                      body={prDescription}
                      onQuoteReply={() => quoteReply(prDescription, pr?.user?.login)}
                    />
                  ) : null}
                  {comments.map((c) => (
                    <ThreadComment
                      key={c.id}
                      user={c.user}
                      createdAt={c.created_at}
                      body={c.body}
                      onQuoteReply={() => quoteReply(c.body ?? "", c.user?.login)}
                    />
                  ))}
                </ul>
              )}

              {/* Composer — même carte que le composer d'issue (CommentComposer),
                  sans mentions ni pièces jointes : un commentaire part sur GitHub,
                  où ni l'un ni l'autre n'a de sens. */}
              <div className="relative w-full rounded-lg border border-border bg-card transition-colors focus-within:border-ring">
                <AutoTextarea
                  ref={composerRef}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void submitComment();
                    }
                  }}
                  placeholder={t("commentPlaceholder")}
                  className="max-h-48 w-full overflow-y-auto bg-transparent px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
                />
                <div className="flex items-center justify-end gap-1.5 px-2.5 pb-2.5">
                  <DictateButton
                    onTranscription={(text) =>
                      setCommentBody((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))
                    }
                    disabled={posting}
                  />
                  {commentBody.trim() || posting ? (
                    <Button
                      size="sm"
                      className="rounded-full px-4"
                      onClick={() => void submitComment()}
                      disabled={!commentBody.trim() || posting}
                    >
                      {posting ? <Spinner /> : null}
                      {t("postComment")}
                    </Button>
                  ) : null}
                </div>
              </div>
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
                  reviewComments={reviewComments}
                  onCommentPosted={refetchReviewComments}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t("prUnavailable")}</p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

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
              {confirmAction?.kind === "merge" ? t("confirmMergeTitle") : t("confirmRejectTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmAction?.kind === "merge"
              ? t("confirmMergeDescription")
              : t("confirmRejectDescription")}
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
              {confirmAction?.kind === "merge" ? t("merge") : t("reject")}
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
          <Textarea
            value={reviewMessage}
            onChange={(e) => setReviewMessage(e.target.value)}
            placeholder={t(
              reviewVerdict === "approve" ? "reviewApprovePlaceholder" : "reviewPlaceholder",
            )}
            rows={4}
            autoFocus
            className="resize-none bg-card"
          />

          {/* Le geste que minddy a et que GitHub n'a pas : la demande de
              changements peut relancer Numo sur cette même PR (MIN-68).
              ABSENT sur une PR sans run (MIN-143) : Numo hérite du travail par
              les runs PRÉCÉDENTS du ticket, et une PR humaine n'en a aucun — il
              repartirait d'une branche neuve au lieu de reprendre celle-ci. Le
              geste est masqué plutôt que cassé. */}
          {reviewVerdict === "request_changes" && canRelaunch ? (
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

          <DialogFooter className="sm:justify-between">
            {/* Nouvelle run = nouveau choix de modèle (identique à un premier
                lancement) ; vide = le modèle par défaut du compte. */}
            {reviewVerdict === "request_changes" && canRelaunch && relaunch && !item.busyRunId ? (
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
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => setReviewVerdict(null)}
              >
                {t("cancel")}
              </Button>
              <Button
                disabled={
                  submitting || (!reviewMessage.trim() && reviewVerdict !== "approve")
                }
                onClick={() => void submitReview()}
              >
                {submitting ? <Spinner /> : null}
                {reviewVerdict === "request_changes" && canRelaunch && relaunch && !item.busyRunId
                  ? t("sendToNumo")
                  : t("reviewSubmit")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
