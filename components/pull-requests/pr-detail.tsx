"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
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
  cn,
  toast,
} from "mangue-ui";
import { Check, ChevronLeft, ExternalLink, GitPullRequest, X } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { PrDiff } from "@/components/pull-requests/pr-diff";
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
}: {
  item: PullRequestListItem;
  onBack: () => void;
  onRefetchList: () => void;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();

  const { pr, files, loading, refetch: refetchPr } = useAgentRunPrQuery(item.runId, true);
  const { comments, loading: commentsLoading, refetch: refetchComments } = usePrCommentsQuery(
    item.runId,
  );

  const [acting, setActing] = useState<null | "merge" | "close">(null);
  const [requesting, setRequesting] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeMessage, setChangeMessage] = useState("");
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
      await requestAgentPrChangesApi(item.runId, message);
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
          <Link
            href={`/projects/${item.project.id}?issue=${item.issue.id}`}
            className="font-mono text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            {identifier}
          </Link>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChangeOpen(true)}
              disabled={isWorking}
            >
              {t("requestChanges")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void act("close")}
              disabled={!!acting || isWorking}
            >
              {acting === "close" ? <Spinner /> : <X />}
              {t("reject")}
            </Button>
            <Button
              size="sm"
              onClick={() => void act("merge")}
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
          {/* Titre issue + méta PR */}
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-2xl leading-tight font-semibold">
              {item.issue?.title ?? pr?.title ?? identifier}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {item.project ? <span>{item.project.name}</span> : null}
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
              {pr?.head && pr?.base ? (
                <span className="font-mono">
                  {pr.head} → {pr.base}
                </span>
              ) : null}
            </div>
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
                          {format.relativeTime(new Date(c.created_at))}
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
                className="resize-none"
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
            className="resize-none"
          />
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
