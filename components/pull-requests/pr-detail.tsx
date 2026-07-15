"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Spinner,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import { Check, ChevronLeft, ExternalLink, GitPullRequest, X } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { NumoIcon } from "@/components/numo-icon";
import { ProjectOrb } from "@/components/project-orb";
import { PrDiff } from "@/components/pull-requests/pr-diff";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { useAgentRunPrQuery, usePrCommentsQuery } from "@/lib/use-agent-runs";
import {
  actOnAgentPrApi,
  postPrCommentApi,
  requestAgentPrChangesApi,
  type PullRequestListItem,
} from "@/lib/agent-api";
import { issueIdentifier } from "@/lib/issue-constants";

/**
 * Panneau de détail d'une PR (MIN-66) : en-tête (issue + état + lien GitHub),
 * barre d'actions (accepter/refuser/demander des changements), diff, et fil de
 * commentaires GitHub. Tout est piloté par le run canonique `item.runId`.
 */

function stateBadgeVariant(
  state: PullRequestListItem["pr_state"],
): "default" | "secondary" | "destructive" | "outline" {
  if (state === "merged") return "default";
  if (state === "closed") return "destructive";
  return "secondary";
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
  const format = useFormatter();
  const now = useNow();
  const { defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const { defaultModel } = useAgentPreferencesQuery();

  const { pr, files, loading, refetch: refetchPr } = useAgentRunPrQuery(item.runId, true);
  const { comments, loading: commentsLoading, refetch: refetchComments } = usePrCommentsQuery(
    item.runId,
  );

  const [acting, setActing] = useState<null | "merge" | "close">(null);
  const [confirmAction, setConfirmAction] = useState<null | "merge" | "close">(null);
  const [requesting, setRequesting] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeMessage, setChangeMessage] = useState("");
  // Modèle de la run à lancer — vide = le défaut du compte (MIN-68 : une demande de
  // changements est un lancement à froid, elle a donc son propre choix de modèle).
  const [model, setModel] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);

  const isWorking = !!item.activeRunId;
  const stateKey =
    item.pr_state === "merged" ? "stateMerged" : item.pr_state === "closed" ? "stateClosed" : "stateOpen";
  const isTerminal = item.pr_state === "merged" || item.pr_state === "closed";

  // Quand Numo termine (le run actif disparaît de la liste), rafraîchir diff + commentaires.
  const prevWorking = useRef(isWorking);
  useEffect(() => {
    if (prevWorking.current && !isWorking) {
      void refetchPr();
      void refetchComments();
    }
    prevWorking.current = isWorking;
  }, [isWorking, refetchPr, refetchComments]);

  const act = async (action: "merge" | "close") => {
    if (acting) return;
    setActing(action);
    setConfirmAction(null);
    try {
      await actOnAgentPrApi(item.runId, action);
      toast.success(action === "merge" ? t("mergedToast") : t("closedToast"));
      onRefetchList();
      await refetchPr();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActing(null);
    }
  };

  const submitChangeRequest = async () => {
    const message = changeMessage.trim();
    if (!message || requesting) return;
    setRequesting(true);
    try {
      // MIN-68 : poste la review sur la PR puis lance une run NEUVE (le modèle est
      // choisi ici, comme à un premier lancement) qui hérite de cette PR.
      await requestAgentPrChangesApi(item.runId, message, model || undefined);
      toast.success(t("changesRequestedToast"));
      setChangeOpen(false);
      setChangeMessage("");
      onRefetchList(); // fait apparaître le nouveau run actif → active le polling de la liste.
      await refetchComments();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRequesting(false);
    }
  };

  const submitComment = async () => {
    const body = commentBody.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      await postPrCommentApi(item.runId, body);
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
          <span className="font-mono text-sm text-muted-foreground">{identifier}</span>
        )}
        <Badge variant={stateBadgeVariant(item.pr_state)} icon={<GitPullRequest />}>
          {t(stateKey)}
        </Badge>
        {isWorking ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner />
            {t("numoWorking")}
          </span>
        ) : null}

        {!isTerminal ? (
          <div className="ml-auto flex items-center gap-1.5">
            {/* Une demande de changements LANCE une run : impossible tant qu'une run
                occupe l'issue (le serveur renvoie 409). Merger/refuser reste permis,
                d'où `busyRunId` plutôt que `isWorking`. */}
            {item.busyRunId ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" size="sm" disabled>
                      {t("requestChanges")}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {tAgent("errorAlreadyRunning")}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setChangeOpen(true)}>
                {t("requestChanges")}
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmAction("close")}
              disabled={!!acting || isWorking}
            >
              {acting === "close" ? <Spinner /> : <X />}
              {t("reject")}
            </Button>
            <Button
              size="sm"
              onClick={() => setConfirmAction("merge")}
              disabled={!!acting || isWorking}
            >
              {acting === "merge" ? <Spinner /> : <Check />}
              {t("accept")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {/* Titre issue + méta PR + description */}
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl leading-tight font-semibold">
              {item.issue?.title ?? pr?.title ?? identifier}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary" icon={<NumoIcon animated={false} />} className="h-6">
                {t("generatedByNumo")}
              </Badge>
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
                  {t("prNumber", { number: pr.number })}
                </a>
              ) : null}
            </div>
            {prDescription ? (
              <Markdown className="mt-1 text-sm text-muted-foreground [&_code]:bg-primary/10 [&_code]:text-primary [&_pre_code]:text-inherit">
                {prDescription}
              </Markdown>
            ) : null}
          </div>

          {/* Diff */}
          <section className="flex flex-col gap-2">
            {loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-40 rounded-md" />
              </div>
            ) : pr ? (
              <PrDiff files={files} prUrl={pr.url} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("prUnavailable")}</p>
            )}
          </section>

          {/* Fil de commentaires GitHub */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t("comments")}</h2>
            {commentsLoading ? (
              <Skeleton className="h-16 rounded-md" />
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noComments")}</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <Avatar className="size-7 shrink-0">
                      {c.user?.avatar_url ? (
                        <AvatarImage src={c.user.avatar_url} alt={c.user.login} />
                      ) : null}
                      <AvatarFallback>
                        {(c.user?.login ?? "?").slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{c.user?.login ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">
                          {format.relativeTime(new Date(c.created_at), now)}
                        </span>
                      </div>
                      <Markdown className="text-sm text-foreground">{c.body}</Markdown>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Composer */}
            <div className="flex flex-col gap-2">
              <Textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder={t("commentPlaceholder")}
                rows={3}
                className="resize-none bg-card"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => void submitComment()}
                  disabled={!commentBody.trim() || posting}
                >
                  {posting ? <Spinner /> : null}
                  {t("postComment")}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Confirmation accepter / refuser */}
      <Dialog
        open={!!confirmAction}
        onOpenChange={(next) => {
          if (!next && !acting) setConfirmAction(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "merge" ? t("confirmAcceptTitle") : t("confirmRejectTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmAction === "merge"
              ? t("confirmAcceptDescription")
              : t("confirmRejectDescription")}
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={!!acting} onClick={() => setConfirmAction(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant={confirmAction === "close" ? "destructive" : "default"}
              disabled={!!acting}
              onClick={() => confirmAction && void act(confirmAction)}
            >
              {acting ? <Spinner /> : null}
              {confirmAction === "merge" ? t("accept") : t("reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue « demander des changements » */}
      <Dialog
        open={changeOpen}
        onOpenChange={(next) => {
          if (!next && !requesting) setChangeOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("requestChangesTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("requestChangesDescription")}</p>
          <Textarea
            value={changeMessage}
            onChange={(e) => setChangeMessage(e.target.value)}
            placeholder={t("requestChangesPlaceholder")}
            rows={4}
            autoFocus
            className="resize-none bg-card"
          />
          <DialogFooter className="sm:justify-between">
            {/* Nouvelle run = nouveau choix de modèle (identique à un premier
                lancement) ; vide = le modèle par défaut du compte. */}
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
              disabled={requesting}
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={requesting} onClick={() => setChangeOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                disabled={requesting || !changeMessage.trim()}
                onClick={() => void submitChangeRequest()}
              >
                {requesting ? <Spinner /> : null}
                {t("sendToNumo")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
