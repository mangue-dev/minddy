"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Button,
  ConfirmDeleteDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
  SplitButton,
  cn,
  toast,
} from "mangue-ui";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronUp,
  GitMerge,
  Link2,
  Lock,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  Sparkles,
  TriangleAlert,
  Undo2,
} from "lucide-react";
// (ChevronUp sert au compteur de voix des cartes de facettes)
import { IssueSidePanel } from "@/components/issue-side-panel";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useIssueRelationsQuery } from "@/lib/use-issue-relations-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import type { Issue, IssueRelationType } from "@/lib/types";
import { AutoTextarea } from "@/components/auto-textarea";
import { MarkdownEditor } from "@/components/markdown-editor";
import { StatusIndicator } from "@/components/issue-indicators";
import {
  FEEDBACK_TO_ISSUE_STATUS,
  FeedbackStatusBadge,
} from "@/app/f/[token]/feedback-bits";
import { useProjects } from "@/lib/projects-context";
import { issueIdentifier } from "@/lib/issue-constants";
import { FEEDBACK_POST_STATUSES, type FeedbackPostStatus } from "@/lib/feedback/types";
import type {
  TeamFeedbackDetail,
  TeamFeedbackListItem,
} from "@/lib/server/feedback/team-queries";

/**
 * Onglet équipe du feedback (MIN-37) — deux panneaux façon triage : liste triée
 * par votes (vraies identités, indicateur de suggestion IA), détail avec
 * édition de la couche canonique (le brut reste visible), merge 1-clic + undo,
 * file de suggestions, gestion des facettes, réponse d'équipe, promotion en
 * issue et saisie interne au nom d'un utilisateur.
 */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) throw new Error(data?.error || "error");
  return data as T;
}

export function FeedbackTeamPage() {
  const t = useTranslations("FeedbackBoard");
  const format = useFormatter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const queryClient = useQueryClient();

  const { data: listData, isLoading } = useQuery({
    queryKey: ["feedback", projectId],
    queryFn: () =>
      api<{ posts: TeamFeedbackListItem[] }>(`/api/projects/${projectId}/feedback`),
  });
  const posts = useMemo(() => listData?.posts ?? [], [listData]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Side panel d'issue : le ticket lié s'ouvre ICI, sans navigation — même
  // câblage que le board (issues + relations + collections du projet).
  const { issues, createIssue, updateIssue, deleteIssue, setCategories } =
    useIssuesQuery(projectId);
  const { relations, addRelation, removeRelation } = useIssueRelationsQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);
  const { categories } = useCategoriesQuery(projectId);
  const { objectives } = useObjectivesQuery(projectId);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const openIssue: Issue | null = issues.find((i) => i.id === openIssueId) ?? null;
  const handleAddRelation = useCallback(
    (sourceId: string, type: IssueRelationType, targetId: string) => {
      void addRelation(sourceId, type, targetId).catch((err) =>
        toast.error((err as Error).message)
      );
    },
    [addRelation]
  );
  const handleRemoveRelation = useCallback(
    (relationId: string) => {
      void removeRelation(relationId).catch((err) => toast.error((err as Error).message));
    },
    [removeRelation]
  );

  useEffect(() => {
    if (posts.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !posts.some((p) => p.id === selectedId)) {
      setSelectedId(posts[0].id);
    }
  }, [posts, selectedId]);

  // Invalide la liste ET tous les détails du projet (préfixe) : un merge/undo
  // change aussi le post canonique, pas seulement celui qu'on regarde. Le
  // badge de la sidebar suit aussi (compteur ouverts/prévus).
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["feedback", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["feedback-detail", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["feedback-count", projectId] });
  };

  return (
    <div className="flex h-full min-h-0">
      {/* ── Liste ────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex w-full flex-col border-r md:w-80 md:shrink-0",
          mobileDetail && "hidden md:flex"
        )}
      >
        {/* Header façon triage : gros titre + compteur discret. */}
        <div className="flex items-center gap-2 px-4 pt-5 pb-2">
          <h1 className="font-display text-lg font-semibold tracking-tight">{t("title")}</h1>
          {posts.length > 0 && (
            <span className="text-sm tabular-nums text-muted-foreground">{posts.length}</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            {t("newFeedback")}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <MessagesSquare className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
              <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>
            </div>
          ) : (
            <ul>
              {posts.map((post) => (
                <li key={post.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(post.id);
                      setMobileDetail(true);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                      selectedId === post.id && "bg-muted/70"
                    )}
                  >
                    {/* Même badge de voix que les facettes. */}
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                      <ChevronUp className="size-3" />
                      {post.vote_count}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="line-clamp-2 text-sm font-medium leading-snug">
                        {post.title}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <FeedbackStatusBadge status={post.status} />
                        {!post.is_public && (
                          <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]">
                            <Lock className="size-2.5" />
                            {t("private")}
                          </span>
                        )}
                        {post.suggested_merge_into_id && (
                          <Sparkles className="size-3 text-brand" />
                        )}
                        {post.facet_count > 0 && <span>{post.facet_count} ⌘</span>}
                        <span>
                          {format.dateTime(new Date(post.created_at), { dateStyle: "short" })}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Détail ──────────────────────────────────────────────────────── */}
      <div className={cn("min-w-0 flex-1", !mobileDetail && "hidden md:block")}>
        {selectedId ? (
          <FeedbackDetail
            key={selectedId}
            projectId={projectId}
            projectName={project?.name ?? ""}
            projectKey={project?.key ?? ""}
            postId={selectedId}
            allPosts={posts}
            onBack={() => setMobileDetail(false)}
            onChanged={refresh}
            onOpenIssue={setOpenIssueId}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">{t("selectPost")}</p>
          </div>
        )}
      </div>

      <InternalFeedbackDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(postId) => {
          refresh();
          setSelectedId(postId);
        }}
      />

      <IssueSidePanel
        issue={openIssue}
        open={!!openIssue}
        onOpenChange={(next) => {
          if (!next) setOpenIssueId(null);
        }}
        projectKey={project?.key ?? ""}
        members={members}
        categories={categories}
        objectives={objectives}
        allIssues={issues}
        relations={relations}
        onUpdate={updateIssue}
        onDelete={async (issueId) => {
          await deleteIssue(issueId);
          setOpenIssueId(null);
          refresh();
        }}
        onSetCategories={setCategories}
        onCreate={createIssue}
        onOpenIssue={setOpenIssueId}
        onAddRelation={handleAddRelation}
        onRemoveRelation={handleRemoveRelation}
      />
    </div>
  );
}

// ── Détail ──────────────────────────────────────────────────────────────────

function FeedbackDetail({
  projectId,
  projectName,
  projectKey,
  postId,
  allPosts,
  onBack,
  onChanged,
  onOpenIssue,
}: {
  projectId: string;
  projectName: string;
  projectKey: string;
  postId: string;
  allPosts: TeamFeedbackListItem[];
  onBack: () => void;
  onChanged: () => void;
  /** Ouvre le side panel d'issue directement (pas de navigation). */
  onOpenIssue: (issueId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const tStatus = useTranslations("PublicFeedback");
  const format = useFormatter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["feedback-detail", projectId, postId],
    queryFn: () =>
      api<{ post: TeamFeedbackDetail }>(`/api/projects/${projectId}/feedback/${postId}`),
  });
  const post = data?.post ?? null;

  const [title, setTitle] = useState("");
  const [response, setResponse] = useState("");
  const [respondEditing, setRespondEditing] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setResponse(post.team_response ?? "");
      setRespondEditing(false);
    }
  }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshDetail = () => {
    void queryClient.invalidateQueries({ queryKey: ["feedback-detail", projectId] });
    onChanged();
  };

  const patch = useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      api(`/api/projects/${projectId}/feedback/${postId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      }),
    onSuccess: refreshDetail,
    onError: (e: Error) => toast.error(e.message || t("errorGeneric")),
  });

  const action = useMutation({
    mutationFn: ({ path, body: payload }: { path: string; body?: unknown }) =>
      api(`/api/projects/${projectId}/feedback/${path}`, {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      }),
    onSuccess: refreshDetail,
    onError: (e: Error) => toast.error(e.message || t("errorGeneric")),
  });

  if (isLoading || !post) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const rawDiffers =
    post.submitted_title !== post.title || post.submitted_body !== post.body;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5 desktop:px-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-muted-foreground md:hidden"
          >
            <ChevronLeft className="size-3.5" />
            {t("title")}
          </button>
          <span className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
            {/* Même badge de voix que les facettes. */}
            <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums">
              <ChevronUp className="size-3" />
              {post.vote_count}
            </span>
            {t(`source.${post.source}`)} ·{" "}
            {format.dateTime(new Date(post.created_at), { dateStyle: "medium" })}
            {!post.is_public && (
              <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]">
                <Lock className="size-2.5" />
                {t("private")}
              </span>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            {/* Statut public : un select tant que le post est autonome — dès
                qu'un ticket est lié, le statut suit l'issue (status-sync) et
                devient lecture seule. */}
            {post.issue ? (
              <FeedbackStatusBadge status={post.status} />
            ) : (
              <Select
                value={post.status}
                onValueChange={(value) => {
                  if (value !== post.status) patch.mutate({ status: value });
                }}
              >
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_POST_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      <StatusIndicator
                        status={FEEDBACK_TO_ISSUE_STATUS[status]}
                        className="size-3.5"
                      />
                      {tStatus(`status.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {post.issue ? (
              // Ouvre le side panel ici même — pas de détour par la vue tickets.
              <button
                type="button"
                onClick={() => onOpenIssue(post.issue!.id)}
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("linkedIssue")} · {issueIdentifier(projectKey, post.issue.number)}
                <ArrowUpRight className="size-3" />
              </button>
            ) : (
              <SplitButton
                variant="outline"
                size="sm"
                disabled={action.isPending}
                onClick={() => action.mutate({ path: `${postId}/promote` })}
                menuLabel={t("linkToIssue")}
                menu={
                  <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
                    <Link2 className="size-4" />
                    {t("linkToIssue")}
                  </DropdownMenuItem>
                }
              >
                {t("promote")}
              </SplitButton>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="…">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setMergeOpen(true)}>
                  <GitMerge className="size-4" />
                  {t("mergeInto")}
                </DropdownMenuItem>
                {post.issue && (
                  <DropdownMenuItem
                    onSelect={() =>
                      void api(`/api/projects/${projectId}/feedback/${postId}/link`, {
                        method: "DELETE",
                      })
                        .then(refreshDetail)
                        .catch((e: Error) => toast.error(e.message || t("errorGeneric")))
                    }
                  >
                    <Link2 className="size-4" />
                    {t("unlinkIssue")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  {t("deletePost")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {post.suggested_merge_into_id && post.suggested_title && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-2">
            <Sparkles className="size-3.5 shrink-0 text-brand" />
            <p className="min-w-0 flex-1 text-xs">
              {t("suggestionBanner", {
                title: post.suggested_title,
                confidence: Math.round((post.suggested_confidence ?? 0) * 100),
              })}
            </p>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ path: `${postId}/suggestion`, body: { action: "accept" } })
                }
              >
                {t("acceptSuggestion")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ path: `${postId}/suggestion`, body: { action: "reject" } })
                }
              >
                {t("rejectSuggestion")}
              </Button>
            </div>
          </div>
        )}

        {/* Titre + description rapprochés, comme dans le triage — la
            description est éditée en markdown rendu (même éditeur). */}
        <div className="flex flex-col gap-2">
          <AutoTextarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const trimmed = title.trim();
              if (trimmed && trimmed !== post.title) patch.mutate({ title: trimmed });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="w-full overflow-hidden bg-transparent text-2xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
            maxLength={200}
          />
          <MarkdownEditor
            key={post.id}
            value={post.body}
            onCommit={(markdown) => {
              if (markdown !== post.body) patch.mutate({ body: markdown });
            }}
            placeholder={t("postBodyPlaceholder")}
            className="min-h-16"
          />
        </div>

        {rawDiffers && (
          <details className="rounded-md border border-border/60 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              {t("rawTitle")}
            </summary>
            <div className="mt-2 flex flex-col gap-1 text-sm">
              <p className="font-medium">{post.submitted_title}</p>
              {post.submitted_body && (
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {post.submitted_body}
                </p>
              )}
            </div>
          </details>
        )}

        {post.author && (post.author.name || post.author.email) && (
          <p className="text-xs text-muted-foreground">
            {t("author")} :{" "}
            <span className="font-medium">
              {[post.author.name, post.author.email].filter(Boolean).join(" · ")}
            </span>
          </p>
        )}

        {post.merged_from.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitMerge className="size-3" />
            {t("mergedFromLabel")} : {post.merged_from.map((m) => m.title).join(" · ")}
          </p>
        )}

        {post.merge_events.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md border border-border/60 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">{t("merges")}</p>
            {post.merge_events.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate">
                  {event.dup_title ?? event.dup_id} ·{" "}
                  {event.performed_by === "ai" ? t("byAi") : t("byTeam")}
                  {event.confidence !== null &&
                    ` (${Math.round(event.confidence * 100)} %)`}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ path: `merges/${event.id}/undo` })}
                >
                  <Undo2 className="size-3.5" />
                  {t("undo")}
                </Button>
              </div>
            ))}
          </div>
        )}

        <FacetSection
          projectId={projectId}
          post={post}
          onChanged={refreshDetail}
        />

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t("respondTitle")}</h3>
          {post.team_response && !respondEditing ? (
            // État publié : la réponse telle que le board la montre, avec sa
            // date — l'édition est un mode explicite.
            <div className="flex flex-col gap-1.5 rounded-lg border border-brand/25 bg-brand/5 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {post.team_response}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {post.team_response_at
                    ? t("respondPublishedAt", {
                        date: format.dateTime(new Date(post.team_response_at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      })
                    : null}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setResponse(post.team_response ?? "");
                    setRespondEditing(true);
                  }}
                >
                  {t("respondEdit")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <AutoTextarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder={t("respondPlaceholder", { project: projectName })}
                className="min-h-16 w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
                maxLength={5000}
              />
              <div className="flex items-center justify-end gap-2">
                {respondEditing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setResponse(post.team_response ?? "");
                      setRespondEditing(false);
                    }}
                  >
                    {t("respondCancel")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={patch.isPending || response.trim() === (post.team_response ?? "")}
                  onClick={() =>
                    patch.mutate(
                      { team_response: response },
                      { onSuccess: () => setRespondEditing(false) }
                    )
                  }
                >
                  {patch.isPending && <Spinner />}
                  {post.team_response ? t("respondUpdate") : t("saveResponse")}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        candidates={allPosts.filter((p) => p.id !== postId && !p.issue_id)}
        onMerge={(canonicalId) => {
          setMergeOpen(false);
          action.mutate({ path: `${postId}/merge`, body: { canonical_id: canonicalId } });
        }}
      />
      <LinkIssueDialog
        projectId={projectId}
        projectKey={projectKey}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onLink={(issueId) => {
          setLinkOpen(false);
          action.mutate({ path: `${postId}/link`, body: { issue_id: issueId } });
        }}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={post.title}
        description={t("deletePostConfirm")}
        onConfirm={async () => {
          await api(`/api/projects/${projectId}/feedback/${postId}`, { method: "DELETE" });
          setDeleteOpen(false);
          onChanged();
        }}
      />
    </div>
  );
}

// ── Facettes ─────────────────────────────────────────────────────────────────

function FacetSection({
  projectId,
  post,
  onChanged,
}: {
  projectId: string;
  post: TeamFeedbackDetail;
  onChanged: () => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  // Facette ouverte en dialog (texte complet, comme sur le board public).
  const [expanded, setExpanded] = useState<TeamFeedbackDetail["facets"][number] | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message || t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t("facets")}</h3>
      {post.facets.length > 0 && (
        // Comme sur le board public : cartes arrondies en carrousel.
        <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {post.facets.map((facet) => (
            <div
              key={facet.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (renaming?.id !== facet.id) setExpanded(facet);
              }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && renaming?.id !== facet.id) {
                  e.preventDefault();
                  setExpanded(facet);
                }
              }}
              className="flex w-56 shrink-0 cursor-pointer flex-col justify-between gap-2 rounded-lg border border-border/70 bg-card/50 px-3 py-2.5 outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {renaming?.id === facet.id ? (
                <Input
                  autoFocus
                  value={renaming.text}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenaming({ id: facet.id, text: e.target.value })}
                  onBlur={() => {
                    const next = renaming.text.trim();
                    setRenaming(null);
                    if (next && next !== facet.text) {
                      void run(() =>
                        api(`/api/projects/${projectId}/feedback/facets/${facet.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ text: next }),
                        })
                      );
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="h-7 text-xs"
                />
              ) : (
                <p className="line-clamp-2 text-xs leading-snug text-foreground/90" title={facet.text}>
                  {facet.review_flag === "root_disguised" && (
                    <TriangleAlert
                      className="mr-1 inline size-3 text-amber-600 dark:text-amber-400"
                      aria-label={t("reviewFlag")}
                    />
                  )}
                  {facet.text}
                </p>
              )}
              {/* stopPropagation : les actions du pied de carte ne doivent pas
                  ouvrir le dialog. */}
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
              <div
                className="flex items-center justify-between gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                  <ChevronUp className="size-3" />
                  {facet.vote_count}
                </span>
                <span className="ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {t(`facetSource.${facet.source}`)}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="…">
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => setRenaming({ id: facet.id, text: facet.text })}
                    >
                      {t("rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        void run(() =>
                          api(
                            `/api/projects/${projectId}/feedback/facets/${facet.id}/convert`,
                            { method: "POST", body: JSON.stringify({}) }
                          )
                        )
                      }
                    >
                      {t("convertToPost")}
                    </DropdownMenuItem>
                    {post.facets.length > 1 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <GitMerge className="size-4" />
                          {t("mergeFacetInto")}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {post.facets
                            .filter((other) => other.id !== facet.id)
                            .map((other) => (
                              <DropdownMenuItem
                                key={other.id}
                                disabled={busy}
                                onSelect={() =>
                                  void run(() =>
                                    api(
                                      `/api/projects/${projectId}/feedback/facets/${facet.id}/merge`,
                                      {
                                        method: "POST",
                                        body: JSON.stringify({ canonical_id: other.id }),
                                      }
                                    )
                                  )
                                }
                              >
                                <span className="max-w-56 truncate">{other.text}</span>
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() =>
                        void run(() =>
                          api(`/api/projects/${projectId}/feedback/facets/${facet.id}`, {
                            method: "DELETE",
                          })
                        )
                      }
                    >
                      {t("delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Texte complet en dialog, comme sur le board public. */}
      <Dialog open={!!expanded} onOpenChange={(next) => !next && setExpanded(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="sr-only">{t("facets")}</DialogTitle>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
            {expanded?.text}
          </p>
          {expanded && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                <ChevronUp className="size-3" />
                {expanded.vote_count}
              </span>
              <span className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t(`facetSource.${expanded.source}`)}
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = text.trim();
          if (!trimmed) return;
          void run(() =>
            api(`/api/projects/${projectId}/feedback/${post.id}/facets`, {
              method: "POST",
              body: JSON.stringify({ text: trimmed }),
            })
          ).then(() => setText(""));
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("addFacetPlaceholder")}
          maxLength={200}
        />
        <Button type="submit" variant="outline" disabled={busy || !text.trim()}>
          {t("add")}
        </Button>
      </form>
    </section>
  );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

function MergeDialog({
  open,
  onOpenChange,
  candidates,
  onMerge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: TeamFeedbackListItem[];
  onMerge: (canonicalId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const [search, setSearch] = useState("");
  const filtered = candidates.filter((p) =>
    p.title.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="size-4 text-brand" />
            {t("mergeDialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("mergeDialogDesc")}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("mergeSearchPlaceholder")}
        />
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {filtered.map((post) => (
            <button
              key={post.id}
              type="button"
              onClick={() => onMerge(post.id)}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <span className="min-w-0 truncate">{post.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                ▲ {post.vote_count}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Lier à une issue existante : recherche par titre ou identifiant, les
    issues closes (canceled/duplicate) sont exclues. */
function LinkIssueDialog({
  projectId,
  projectKey,
  open,
  onOpenChange,
  onLink,
}: {
  projectId: string;
  projectKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLink: (issueId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const { issues } = useIssuesQuery(open ? projectId : null);
  const [search, setSearch] = useState("");

  const needle = search.trim().toLowerCase();
  const candidates = issues
    .filter((issue) => issue.status !== "canceled" && issue.status !== "duplicate")
    .filter(
      (issue) =>
        !needle ||
        issue.title.toLowerCase().includes(needle) ||
        issueIdentifier(projectKey, issue.number).toLowerCase().includes(needle)
    )
    .slice(0, 30);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4 text-brand" />
            {t("linkToIssue")}
          </DialogTitle>
          <DialogDescription>{t("linkIssueDialogDesc")}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("linkIssueSearchPlaceholder")}
        />
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {candidates.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => onLink(issue.id)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <StatusIndicator status={issue.status} className="size-4 shrink-0" />
              <code className="shrink-0 font-mono text-xs text-muted-foreground">
                {issueIdentifier(projectKey, issue.number)}
              </code>
              <span className="min-w-0 truncate">{issue.title}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InternalFeedbackDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (postId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEmail("");
    setName("");
    setTitle("");
    setBody("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api<{ post: { id: string } }>(
        `/api/projects/${projectId}/feedback`,
        {
          method: "POST",
          body: JSON.stringify({
            title: title.trim(),
            body: body.trim(),
            user: { email: email.trim(), name: name.trim() || undefined },
          }),
        }
      );
      reset();
      onOpenChange(false);
      onCreated(created.post.id);
    } catch (err) {
      toast.error((err as Error).message || t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("internalDialogTitle")}</DialogTitle>
            <DialogDescription>{t("internalDialogDesc")}</DialogDescription>
          </DialogHeader>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("userEmail")}
            required
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("userName")}
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("postTitlePlaceholder")}
            maxLength={200}
            required
          />
          <AutoTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("postBodyPlaceholder")}
            maxLength={10000}
            className="min-h-16 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
          />
          <DialogFooter>
            <Button type="submit" disabled={busy || !title.trim() || !email.includes("@")}>
              {busy && <Spinner />}
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
