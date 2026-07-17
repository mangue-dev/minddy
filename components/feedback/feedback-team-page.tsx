"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useParams, useRouter, useSearchParams } from "next/navigation";
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
  Ban,
  ChevronLeft,
  ChevronUp,
  Clock,
  GitMerge,
  Globe,
  Link2,
  Lock,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
// (ChevronUp sert au compteur de voix des posts)
import { EmptyState } from "@/components/empty-state";
import { IssueSidePanel } from "@/components/issue-side-panel";
import { CategoryValue, PropertyRow } from "@/components/issue-property-fields";
import { CommentComposer, IssueActivity } from "@/components/issue-timeline";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useIssueRelationsQuery } from "@/lib/use-issue-relations-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { useFeedbackTimeline } from "@/lib/use-feedback-timeline";
import { useAuth } from "@/lib/auth-context";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import type { EventContext } from "@/lib/describe-event";
import type { AttachmentInput, Category, Issue, IssueRelationType, Member } from "@/lib/types";
import { AutoTextarea } from "@/components/auto-textarea";
import { MarkdownEditor } from "@/components/markdown-editor";
import { StatusIndicator } from "@/components/issue-indicators";
import {
  FEEDBACK_TO_ISSUE_STATUS,
  FeedbackStatusBadge,
} from "@/app/f/[token]/feedback-bits";
import { useProjects } from "@/lib/projects-context";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  FEEDBACK_POST_STATUSES,
  type FeedbackPostStatus,
  type FeedbackReviewState,
} from "@/lib/feedback/types";
import type {
  TeamFeedbackDetail,
  TeamFeedbackListItem,
} from "@/lib/server/feedback/team-queries";

/**
 * Onglet équipe du feedback (MIN-37) — deux panneaux façon triage : liste triée
 * par votes (vraies identités, indicateur de suggestion IA), détail avec
 * édition de la couche canonique (le brut reste visible), merge 1-clic + undo,
 * file de suggestions, réponse d'équipe, promotion en issue et saisie interne
 * au nom d'un utilisateur.
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

/** Résumé compact des catégories d'un post dans la liste — même rendu que le
    trigger du sélecteur : pastille + 1er nom + « +N » pour le reste (MIN-52). */
function CategorySummary({
  categoryIds,
  categoryMap,
}: {
  categoryIds: string[];
  categoryMap: Map<string, Category>;
}) {
  const cats = categoryIds
    .map((id) => categoryMap.get(id))
    .filter((c): c is Category => !!c);
  if (cats.length === 0) return null;
  const [first, ...rest] = cats;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: first.color }}
        aria-hidden
      />
      <span className="max-w-[7rem] truncate">{first.name}</span>
      {rest.length > 0 && <span className="shrink-0">+{rest.length}</span>}
    </span>
  );
}

/** Badges d'état de revue IA (MIN-54) : en attente de publication, rejeté (junk),
    et alerte contenu sensible (le motif est en tooltip). Partagé liste + détail. */
function ReviewBadges({
  reviewState,
  sensitivity,
  moderationReason,
}: {
  reviewState: FeedbackReviewState;
  sensitivity: string | null;
  moderationReason: string | null;
}) {
  const t = useTranslations("FeedbackBoard");
  return (
    <>
      {reviewState === "pending" && (
        <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]">
          <Clock className="size-2.5" />
          {t("reviewPending")}
        </span>
      )}
      {reviewState === "rejected" && (
        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 px-1.5 py-0.5 text-[10px] text-destructive">
          <Ban className="size-2.5" />
          {t("reviewRejected")}
        </span>
      )}
      {sensitivity && (
        <span
          title={moderationReason ?? undefined}
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-500"
        >
          <ShieldAlert className="size-2.5" />
          {t("sensitive")}
        </span>
      )}
    </>
  );
}

export function FeedbackTeamPage() {
  const t = useTranslations("FeedbackBoard");
  const format = useFormatter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const searchParams = useSearchParams();
  const postParam = searchParams.get("post");
  const router = useRouter();
  const pathname = usePathname();
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
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  // Publie le feedback sélectionné à Numo (MIN-52) : il résout « ce feedback »,
  // « promeus-le », « réponds-lui » sur ce post sans le chercher — comme le
  // panneau d'issue publie l'issue ouverte.
  const selectedPost = posts.find((p) => p.id === selectedId) ?? null;
  useAssistantContext(
    project
      ? selectedPost
        ? { projectId, feedbackId: selectedPost.id, feedbackTitle: selectedPost.title }
        : { projectId }
      : null
  );
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

  // Deep link from an Inbox notification: ?post=<id> selects that feedback and
  // opens the detail on mobile, then strips the param so a background list
  // refetch can't snap the selection back (same idiom as the objectives ?open).
  useEffect(() => {
    if (postParam) {
      setSelectedId(postParam);
      setMobileDetail(true);
      router.replace(pathname);
    }
  }, [postParam, pathname, router]);

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
            <div className="p-4">
              <EmptyState
                icon={<MessagesSquare className="size-6" />}
                title={t("empty")}
                description={t("emptyHint")}
              />
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
                    {/* Badge de voix du post. */}
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
                        <ReviewBadges
                          reviewState={post.review_state}
                          sensitivity={post.sensitivity}
                          moderationReason={post.moderation_reason}
                        />
                        {post.suggested_merge_into_id && (
                          <Sparkles className="size-3 text-brand" />
                        )}
                        <span>
                          {format.dateTime(new Date(post.created_at), { dateStyle: "short" })}
                        </span>
                        <CategorySummary
                          categoryIds={post.category_ids}
                          categoryMap={categoryMap}
                        />
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
            members={members}
            categories={categories}
            issues={issues}
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
  members,
  categories,
  issues,
  onBack,
  onChanged,
  onOpenIssue,
}: {
  projectId: string;
  projectName: string;
  projectKey: string;
  postId: string;
  allPosts: TeamFeedbackListItem[];
  /** Project members + issues — resolve actor names and issue refs in the feed. */
  members: Member[];
  /** Catégories du projet (celles des issues) — réutilisées ici (MIN-52). */
  categories: Category[];
  issues: Issue[];
  onBack: () => void;
  onChanged: () => void;
  /** Ouvre le side panel d'issue directement (pas de navigation). */
  onOpenIssue: (issueId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const tStatus = useTranslations("PublicFeedback");
  const tField = useTranslations("Field");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const {
    items: activityItems,
    addComment,
    updateComment,
    deleteComment,
    deleteAttachment,
  } = useFeedbackTimeline(projectId, postId);

  // IssueActivity is generic — the feedback thread wires the same handlers as
  // the issue/objective panels (onReply flips the arg order of addComment).
  const handleReply = useCallback(
    (
      parentId: string,
      body: string,
      mentionedUserIds: string[],
      attachments: AttachmentInput[]
    ) => addComment(body, mentionedUserIds, parentId, attachments),
    [addComment]
  );
  const handleComment = useCallback(
    (body: string, mentionedUserIds: string[], attachments: AttachmentInput[]) =>
      addComment(body, mentionedUserIds, null, attachments),
    [addComment]
  );

  // describeFeedbackEvent reads members (actors) + issues/projectKey (refs);
  // objectives/categories are unused for feedback.
  const eventCtx = useMemo<EventContext>(
    () => ({ members, objectives: [], categories: [], issues, projectKey }),
    [members, issues, projectKey]
  );

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
    // Le fil d'activité n'a pas de realtime : chaque action le rafraîchit.
    void queryClient.invalidateQueries({ queryKey: ["feedback-events", projectId] });
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

  // Catégories du post (MIN-52) : optimiste + debounce 300 ms, comme les cartes
  // d'issue. Des toggles rapides patchent le cache tout de suite et fusionnent en
  // un seul PUT du jeu final (évite le delete-then-insert concurrent sur la
  // table de jonction). Erreur → toast + refetch autoritatif.
  const catTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catLatest = useRef<string[] | null>(null);
  const flushCategories = useCallback(
    (ids: string[]) =>
      api(`/api/projects/${projectId}/feedback/${postId}/categories`, {
        method: "PUT",
        body: JSON.stringify({ category_ids: ids }),
      }),
    [projectId, postId]
  );
  const handleCategoriesChange = useCallback(
    (ids: string[]) => {
      queryClient.setQueryData<{ post: TeamFeedbackDetail }>(
        ["feedback-detail", projectId, postId],
        (old) => (old ? { post: { ...old.post, category_ids: ids } } : old)
      );
      queryClient.setQueryData<{ posts: TeamFeedbackListItem[] }>(
        ["feedback", projectId],
        (old) =>
          old
            ? {
                posts: old.posts.map((p) =>
                  p.id === postId ? { ...p, category_ids: ids } : p
                ),
              }
            : old
      );
      catLatest.current = ids;
      if (catTimer.current) clearTimeout(catTimer.current);
      catTimer.current = setTimeout(() => {
        catTimer.current = null;
        const finalIds = catLatest.current ?? ids;
        catLatest.current = null;
        void flushCategories(finalIds).catch((e: Error) => {
          toast.error(e.message || t("errorGeneric"));
          void queryClient.invalidateQueries({ queryKey: ["feedback", projectId] });
          void queryClient.invalidateQueries({ queryKey: ["feedback-detail", projectId] });
        });
      }, 300);
    },
    [projectId, postId, queryClient, flushCategories, t]
  );
  // Quitter le détail avant la fin du debounce ne doit pas perdre l'édition :
  // on flush l'écriture en attente à l'unmount (le patch optimiste est déjà posé).
  useEffect(() => {
    return () => {
      if (!catTimer.current) return;
      clearTimeout(catTimer.current);
      catTimer.current = null;
      const ids = catLatest.current;
      catLatest.current = null;
      if (ids) void flushCategories(ids).catch(() => {});
    };
  }, [flushCategories]);

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
    <div className="flex h-full min-h-0 flex-col">
      {/* Barre du haut, façon triage : retour (mobile) · identifiants (votes,
          source, date, privé) à gauche · options (statut, promotion/lien,
          merge, suppression) à droite. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("title")}
          className="md:hidden"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* Badge de voix du post. */}
          <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums">
            <ChevronUp className="size-3" />
            {post.vote_count}
          </span>
          <span className="hidden sm:inline">
            {t(`source.${post.source}`)} ·{" "}
            {format.dateTime(new Date(post.created_at), { dateStyle: "medium" })}
          </span>
          {!post.is_public && (
            <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]">
              <Lock className="size-2.5" />
              {t("private")}
            </span>
          )}
          <ReviewBadges
            reviewState={post.review_state}
            sensitivity={post.sensitivity}
            moderationReason={post.moderation_reason}
          />
        </span>
        <div className="ml-auto flex items-center gap-1.5">
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
              {/* Visibilité : bascule public/privé du post sur le board.
                  L'intitulé annonce l'action à venir (pas l'état actuel). */}
              <DropdownMenuItem
                onSelect={() => patch.mutate({ is_public: !post.is_public })}
              >
                {post.is_public ? (
                  <>
                    <Lock className="size-4" />
                    {t("makePrivate")}
                  </>
                ) : (
                  <>
                    <Globe className="size-4" />
                    {t("makePublic")}
                  </>
                )}
              </DropdownMenuItem>
              {/* Revue IA (MIN-54) : l'équipe peut outrepasser — publier un post en
                  attente/rejeté, ou rejeter un post publié. */}
              {post.review_state !== "published" && (
                <DropdownMenuItem
                  onSelect={() => patch.mutate({ review_state: "published" })}
                >
                  <Send className="size-4" />
                  {t("publishReview")}
                </DropdownMenuItem>
              )}
              {post.review_state !== "rejected" && (
                <DropdownMenuItem
                  onSelect={() => patch.mutate({ review_state: "rejected" })}
                >
                  <Ban className="size-4" />
                  {t("rejectReview")}
                </DropdownMenuItem>
              )}
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
                <Trash2 className="size-4" />
                {t("deletePost")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Corps défilant, centré comme le triage. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
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

        {/* Catégories — rangée clé/valeur, mêmes contrôles que le panneau
            d'issue (MIN-52). Visibles ici pour l'équipe ; leur affichage public
            est un réglage opt-in du board. */}
        <PropertyRow label={tField("categories")}>
          <CategoryValue
            categories={categories}
            value={post.category_ids}
            onChange={handleCategoriesChange}
          />
        </PropertyRow>

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

        {/* Journal d'activité + commentaires internes — parité tickets/objectifs
            (MIN-51). Commentaires team-only : jamais exposés sur le board public. */}
        <div className="flex flex-col gap-3">
          <IssueActivity
            items={activityItems}
            ctx={eventCtx}
            entity="feedback"
            currentUserId={user?.id ?? null}
            projectId={projectId}
            onReply={handleReply}
            onEditComment={updateComment}
            onDeleteComment={deleteComment}
            onDeleteAttachment={deleteAttachment}
          />
          <CommentComposer
            members={members}
            projectId={projectId}
            onSubmit={handleComment}
          />
        </div>
        </div>
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
