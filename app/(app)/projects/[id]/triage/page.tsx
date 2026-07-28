"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import { Check, ChevronLeft, Copy, Filter, X } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { IntegrationIndicator } from "@/components/integration-indicator";
import { RemoteIssueIndicator } from "@/components/remote-issue-indicator";
import {
  AssigneeValue,
  CategoryValue,
  DueDateValue,
  EffortValue,
  ObjectiveValue,
  PriorityValue,
  PropertyRow,
  StatusValue,
} from "@/components/issue-property-fields";
import { PriorityIndicator } from "@/components/issue-indicators";
import { IssueActivity, CommentComposer } from "@/components/issue-timeline";
import { MarkdownEditor } from "@/components/markdown-editor";
import { AutoTextarea } from "@/components/auto-textarea";
import { MentionTextarea, extractMentions } from "@/components/mention-textarea";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import { addCommentApi } from "@/lib/comments-api";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { useIssueTimeline } from "@/lib/use-issue-timeline";
import { issueIdentifier } from "@/lib/issue-constants";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import type { Issue, IssueUpdateInput } from "@/lib/types";

/** Linear-style triage: pending issues on the left, full issue view on the
 *  right where the fields get configured before the issue is accepted onto
 *  the board (→ backlog), declined (→ canceled) or marked as a duplicate. */
export default function TriagePage() {
  const t = useTranslations("Triage");
  const tField = useTranslations("Field");
  const tIssueUI = useTranslations("IssueUI");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const pathname = usePathname();
  const issueParam = useSearchParams().get("issue");
  const { user } = useAuth();

  const { projects, loading: projectsLoading } = useProjects();
  const project = projects.find((p) => p.id === projectId);

  const { issues, loading, updateIssue, setCategories } = useIssuesQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);
  const { categories } = useCategoriesQuery(projectId);
  const { objectives } = useObjectivesQuery(projectId);

  const triageIssues = useMemo(
    () =>
      issues
        .filter((i) => i.status === "triage")
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [issues]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // On mobile the two panes stack: the list shows first, tapping a row slides
  // to the detail; md+ always shows both.
  const [mobileDetail, setMobileDetail] = useState(false);
  const selected = triageIssues.find((i) => i.id === selectedId) ?? null;

  // Publish the selected triage issue to Numo so "accepte ce ticket" resolves.
  useAssistantContext(
    project
      ? selected
        ? {
            projectId,
            issueId: selected.id,
            issueIdentifier: issueIdentifier(project.key, selected.number),
            issueTitle: selected.title,
          }
        : { projectId }
      : null
  );

  const [title, setTitle] = useState("");
  // Accept/decline go through a confirmation dialog with an optional message
  // (posted as a comment on the issue, à la Linear).
  const [confirming, setConfirming] = useState<{
    action: "accept" | "decline";
    issue: Issue;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);

  const {
    items: timelineItems,
    addComment,
    updateComment,
    deleteComment,
    deleteAttachment,
  } = useIssueTimeline(selected?.id ?? null);

  // Keep a valid selection: default to the first pending issue, and when the
  // selected one leaves triage (accepted/declined/duplicate) move on to the next.
  useEffect(() => {
    if (triageIssues.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !triageIssues.some((i) => i.id === selectedId)) {
      setSelectedId(triageIssues[0].id);
    }
  }, [triageIssues, selectedId]);

  // Lien profond depuis la section « À trier » de l'accueil (MIN-104) :
  // ?issue=<id> sélectionne CE ticket plutôt que le premier de la liste, puis
  // purge le paramètre pour qu'un refetch de fond ne ramène pas la sélection
  // ici (même idiome que le ?post= du feedback et le ?open= des objectifs).
  useEffect(() => {
    if (!issueParam) return;
    // On attend que le ticket soit vraiment dans la liste : purger le paramètre
    // avant l'arrivée des tickets laisserait l'effet ci-dessus retomber sur le
    // premier de la file, et le lien profond serait perdu à froid.
    if (!triageIssues.some((i) => i.id === issueParam)) return;
    setSelectedId(issueParam);
    setMobileDetail(true);
    router.replace(pathname);
  }, [issueParam, triageIssues, pathname, router]);

  useEffect(() => {
    if (selected) setTitle(selected.title);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (projectsLoading && !project) {
    return (
      <div className="px-6 py-10">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
        <h1 className="font-display text-xl font-semibold">{t("projectNotFound")}</h1>
        <Button asChild variant="outline">
          <Link href="/home">{t("backToHome")}</Link>
        </Button>
      </div>
    );
  }

  const patch = async (issue: Issue, updates: IssueUpdateInput) => {
    try {
      await updateIssue(issue.id, updates);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const openConfirm = (action: "accept" | "decline", issue: Issue) => {
    setMessage("");
    setConfirming({ action, issue });
  };

  const runConfirm = async () => {
    if (!confirming) return;
    const { action, issue } = confirming;
    setConfirmBusy(true);
    try {
      // Post the message first so it lands while the issue is still selected;
      // then flip the status (the issue leaves the triage list).
      const body = message.trim();
      if (body) await addCommentApi(issue.id, body, extractMentions(message, members));
      await updateIssue(issue.id, {
        status: action === "accept" ? "backlog" : "canceled",
      });
      toast.success(action === "accept" ? t("acceptedToast") : t("declinedToast"));
      setConfirming(null);
      setMessage("");
      setMobileDetail(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConfirmBusy(false);
    }
  };

  const markDuplicate = async (issue: Issue, canonicalId: string) => {
    const canonical = issues.find((i) => i.id === canonicalId);
    await patch(issue, { status: "duplicate", duplicate_of_id: canonicalId });
    toast.success(
      t("duplicateToast", {
        id: canonical ? issueIdentifier(project.key, canonical.number) : "?",
      })
    );
    setMobileDetail(false);
  };

  // Candidate canonical issues: anything except the triaged issue itself and
  // issues that are themselves duplicates.
  const duplicateOptions: PickerOption[] = selected
    ? issues
        .filter((i) => i.id !== selected.id && i.status !== "duplicate")
        .map((i) => ({
          value: i.id,
          label: i.title,
          keywords: [issueIdentifier(project.key, i.number)],
          icon: (
            <span className="font-mono text-xs text-muted-foreground">
              {issueIdentifier(project.key, i.number)}
            </span>
          ),
        }))
    : [];

  const fmtDay = (at: string): string =>
    format.dateTime(new Date(at), { day: "numeric", month: "short" });

  const commitTitle = () => {
    if (!selected) return;
    const trimmed = title.trim();
    if (trimmed && trimmed !== selected.title) void patch(selected, { title: trimmed });
    else if (!trimmed) setTitle(selected.title);
  };

  if (!loading && triageIssues.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-5xl">
            <h1 className="mb-5 font-display text-xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <EmptyState
              icon={<Filter className="size-6" />}
              description={t("emptyState")}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Left: pending list ─────────────────────────────────────────── */}
      <div
        className={cn(
          "min-h-0 w-full shrink-0 flex-col overflow-y-auto border-border md:flex md:w-80 md:border-r",
          mobileDetail ? "hidden" : "flex"
        )}
      >
        <div className="flex items-center gap-2 px-4 pt-5 pb-2">
          <h1 className="font-display text-lg font-semibold tracking-tight">
            {t("title")}
          </h1>
          <span className="text-sm tabular-nums text-muted-foreground">
            {triageIssues.length}
          </span>
        </div>
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col px-2 pb-4">
            {triageIssues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => {
                  setSelectedId(issue.id);
                  setMobileDetail(true);
                }}
                className={cn(
                  "flex flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
                  issue.id === selectedId
                    ? "bg-muted"
                    : "hover:bg-muted/60 focus-visible:bg-muted/60"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {issueIdentifier(project.key, issue.number)}
                  </span>
                  <IntegrationIndicator issue={issue} />
                  <RemoteIssueIndicator issue={issue} />

                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    {issue.priority !== "none" && (
                      <PriorityIndicator priority={issue.priority} className="size-3.5" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {fmtDay(issue.created_at)}
                    </span>
                  </span>
                </div>
                <span className="line-clamp-2 text-sm font-medium">{issue.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Right: full issue view ─────────────────────────────────────── */}
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden"
        )}
      >
        {selected ? (
          <>
            {/* Header: back (mobile) · identifier · triage actions */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3 md:px-6">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("backToList")}
                className="md:hidden"
                onClick={() => setMobileDetail(false)}
              >
                <ChevronLeft />
              </Button>
              <span className="font-mono text-sm text-muted-foreground">
                {issueIdentifier(project.key, selected.number)}
              </span>
              {/* Même ordre que les actions d'une pull request (pr-detail) :
                  l'action neutre, puis le refus, puis l'acceptation en dernier
                  — le geste qui fait avancer le ticket est toujours à droite. */}
              <div className="ml-auto flex items-center gap-1.5">
                <SearchSelect
                  value={null}
                  onChange={(id) => {
                    if (id) void markDuplicate(selected, id);
                  }}
                  options={duplicateOptions}
                  align="end"
                  trigger={
                    <Button variant="outline" size="sm">
                      <Copy className="text-muted-foreground" />
                      {t("markDuplicate")}
                    </Button>
                  }
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => openConfirm("decline", selected)}
                >
                  <X />
                  {t("decline")}
                </Button>
                <Button size="sm" onClick={() => openConfirm("accept", selected)}>
                  <Check />
                  {t("accept")}
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
              <div className="mx-auto flex max-w-3xl flex-col gap-6">
                {/* Title + description */}
                <div className="flex flex-col gap-2">
                  <AutoTextarea
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    className="w-full overflow-hidden bg-transparent text-2xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
                    placeholder={tIssueUI("titlePlaceholder")}
                  />
                  <MarkdownEditor
                    key={selected.id}
                    value={selected.description ?? ""}
                    onCommit={(markdown) => {
                      const next = markdown.trim() || null;
                      if (next !== (selected.description ?? null)) {
                        void patch(selected, { description: next });
                      }
                    }}
                    placeholder={tIssueUI("descriptionPlaceholder")}
                  />
                </div>

                {/* Key/value properties — same borderless rows as the side panel */}
                <div className="flex flex-col">
                  <PropertyRow label={tField("status")}>
                    <StatusValue
                      value={selected.status}
                      onChange={(status) => void patch(selected, { status })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("priority")}>
                    <PriorityValue
                      value={selected.priority}
                      onChange={(priority) => void patch(selected, { priority })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("effort")}>
                    <EffortValue
                      value={selected.effort}
                      onChange={(effort) => void patch(selected, { effort })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("assignee")}>
                    <AssigneeValue
                      value={selected.assignee_id}
                      members={members}
                      onChange={(assignee_id) => void patch(selected, { assignee_id })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("categories")}>
                    <CategoryValue
                      categories={categories}
                      value={selected.category_ids}
                      onChange={(ids) => {
                        void setCategories(selected.id, ids).catch((err) =>
                          toast.error((err as Error).message)
                        );
                      }}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("dueDate")}>
                    <DueDateValue
                      value={selected.due_date}
                      onChange={(due_date) => void patch(selected, { due_date })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("objectiveLinked")}>
                    <ObjectiveValue
                      value={selected.objective_id}
                      objectives={objectives}
                      onChange={(objective_id) => void patch(selected, { objective_id })}
                    />
                  </PropertyRow>
                </div>

                <IssueActivity
                  items={timelineItems}
                  ctx={{
                    members,
                    objectives,
                    categories,
                    issues,
                    projectKey: project.key,
                  }}
                  currentUserId={user?.id ?? null}
                  projectId={projectId}
                  onReply={(parentId, body, mentions, attachments) =>
                    addComment(body, mentions, parentId, attachments)
                  }
                  onEditComment={updateComment}
                  onDeleteComment={deleteComment}
                  onDeleteAttachment={deleteAttachment}
                />

                <CommentComposer
                  members={members}
                  projectId={projectId}
                  onSubmit={(body, mentions, attachments) =>
                    addComment(body, mentions, null, attachments)
                  }
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
          </div>
        )}
      </div>

      {/* Accept / decline confirmation, with an optional message posted as a comment */}
      <Dialog
        open={!!confirming}
        onOpenChange={(next) => {
          if (!next && !confirmBusy) setConfirming(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirming &&
                t(
                  confirming.action === "accept"
                    ? "acceptConfirmTitle"
                    : "declineConfirmTitle",
                  { id: issueIdentifier(project.key, confirming.issue.number) }
                )}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirming &&
              t(
                confirming.action === "accept"
                  ? "acceptConfirmDescription"
                  : "declineConfirmDescription"
              )}
          </p>
          <MentionTextarea
            value={message}
            onChange={setMessage}
            members={members}
            placeholder={t("messagePlaceholder")}
            rows={3}
            autoFocus
            includeNumo
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring"
            onSubmit={() => void runConfirm()}
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={confirmBusy}
              onClick={() => setConfirming(null)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant={confirming?.action === "decline" ? "destructive" : "default"}
              disabled={confirmBusy}
              onClick={() => void runConfirm()}
            >
              {confirmBusy && <Spinner />}
              {confirming?.action === "accept" ? t("accept") : t("decline")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
