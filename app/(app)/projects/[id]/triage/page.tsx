"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Check, ChevronLeft, CircleDotDashed, Copy, X } from "lucide-react";
import { EmptyScene } from "@/components/empty-scene";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { matchesFilter } from "@/components/sidebar-filter-field";
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
import { BulkIssueActions } from "@/components/bulk-issue-actions";
import { AskNumoProvider, useAskNumoTarget } from "@/lib/ask-numo-context";
import { MarkdownEditor } from "@/components/markdown-editor";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
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
import { useIssueRelationsQuery } from "@/lib/use-issue-relations-query";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  useAssistantContext,
  useAssistantPanel,
} from "@/lib/assistant-panel-context";
import { issuesPageContext } from "@/lib/assistant-issue-context";
import { useScrollFade } from "@/lib/use-scroll-fade";
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

  const { issues, loading, updateIssue, deleteIssue, setCategories } =
    useIssuesQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);
  const { categories } = useCategoriesQuery(projectId);
  const { objectives } = useObjectivesQuery(projectId);
  const { addRelation } = useIssueRelationsQuery(projectId);
  const mentions = useDescriptionMentions(projectId, members);
  const { open: openAssistant } = useAssistantPanel();

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
  const [query, setQuery] = useState("");

  /**
   * Ce que la colonne AFFICHE. Le filtre ne touche pas `triageIssues`, dont la
   * sélection est dérivée : sinon taper ferait défiler le ticket ouvert à droite,
   * une fois par lettre — et on filtre justement pour aller EN CHERCHER un.
   */
  const visibleIssues = useMemo(() => {
    if (!query.trim()) return triageIssues;
    return triageIssues.filter((i) =>
      matchesFilter(query, [
        i.title,
        i.description,
        project ? issueIdentifier(project.key, i.number) : null,
      ])
    );
  }, [triageIssues, query, project]);
  // Le fondu qui remplace la bordure sous l'en-tête du détail : il ne paraît
  // que du côté où il reste quelque chose à découvrir.
  const detailFade = useScrollFade<HTMLDivElement>();
  const selected = triageIssues.find((i) => i.id === selectedId) ?? null;

  /**
   * Sélection groupée (MIN-75), le même geste que sur le board : Maj+clic sur
   * une ligne l'ajoute ou la retire, la pilule flottante porte les actions.
   * Deux sélections cohabitent ici sans se confondre — `selectedId`, le ticket
   * OUVERT à droite, et celle-ci, les tickets PRIS ensemble.
   *
   * Elle se dérive de `triageIssues` et non de `visibleIssues` : le filtre de la
   * colonne sert justement à aller chercher le ticket suivant à prendre, et le
   * lier à la sélection la ferait fondre à chaque lettre tapée.
   */
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const toggleBulk = useCallback((issueId: string) => {
    setBulkIds((current) => {
      const next = new Set(current);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  }, []);
  const clearBulk = useCallback(() => setBulkIds(new Set()), []);
  // Un ticket qui quitte le triage (accepté, refusé, doublon) quitte la
  // sélection du même coup : elle ne retient que ce que la colonne montre encore.
  const bulkIssues = useMemo(
    () => triageIssues.filter((issue) => bulkIds.has(issue.id)),
    [triageIssues, bulkIds]
  );
  const updateBulk = useCallback(
    (updates: IssueUpdateInput) => {
      bulkIssues.forEach((issue) => {
        void updateIssue(issue.id, updates).catch((err) =>
          toast.error((err as Error).message)
        );
      });
    },
    [bulkIssues, updateIssue]
  );
  // Une relation a exactement deux bouts : l'action n'existe qu'à deux tickets
  // (même règle que le board, et le triage est mono-projet par construction).
  const bulkLink = useMemo(() => {
    if (bulkIssues.length !== 2) return undefined;
    const [first, second] = bulkIssues;
    return () => {
      void addRelation(first.id, "related", second.id).catch((err) =>
        toast.error((err as Error).message)
      );
      clearBulk();
    };
  }, [bulkIssues, addRelation, clearBulk]);

  /**
   * « @ » (MIN-105) : le ticket sous le pointeur — ou la sélection quand il y en
   * a une — part dans Numo. Même contexte que le bouton Numo de la pilule.
   */
  const handleAskNumo = useCallback(
    (targets: Issue[]) => {
      if (!project || targets.length === 0) return;
      openAssistant({
        projectId,
        pageContext: {
          projectId,
          ...issuesPageContext(targets, (issue) =>
            issueIdentifier(project.key, issue.number)
          ),
        },
      });
    },
    [openAssistant, project, projectId]
  );

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
  } = useIssueTimeline(
    selected?.id ?? null,
    // Cf. issue-side-panel : la naissance du ticket vient de sa propre ligne
    // quand l'événement `created` manque au journal.
    selected
      ? {
          createdAt: selected.created_at,
          createdBy: selected.created_by,
          integrationId: selected.integration_id ?? null,
        }
      : null
  );

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
      /* Triage vide : la même forme que le board et les objectifs — une scène,
         une phrase, et ici rien à faire. Pas de bouton : le triage se remplit
         tout seul, ce n'est pas un endroit où l'on crée. Le titre de la page
         descend DANS le bloc, il n'a pas à être dit deux fois. */
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-5xl">
            <EmptyScene icon={CircleDotDashed} title={t("emptyTitle")} />
          </div>
        </div>
      </div>
    );
  }

  return (
    /* « @ » au survol d'une ligne (ou sur la sélection) ouvre Numo — même
       arbitrage que sur le board : la sélection prime sur le survol (MIN-105).
       Le contexte traverse le portail de la barre secondaire, qui n'est déportée
       que dans le DOM. */
    <AskNumoProvider selectedIssues={bulkIssues} onAskNumo={handleAskNumo}>
    <div className="flex h-full min-h-0">
      {/* ── Left: pending list ─────────────────────────────────────────── */}
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={mobileDetail}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: visibleIssues.length }),
          clearLabel: tCommon("clearFilter"),
        }}
      >
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : visibleIssues.length === 0 ? (
          // Un triage vide est traité plus haut, avant le rendu de la colonne :
          // ici, c'est forcément le filtre qui l'a vidé.
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {tCommon("noFilterMatch")}
          </p>
        ) : (
          <div className="flex flex-col gap-1 px-2 pt-2 pb-4">
            {visibleIssues.map((issue) => (
              <TriageRow
                key={issue.id}
                issue={issue}
                identifier={issueIdentifier(project.key, issue.number)}
                createdLabel={fmtDay(issue.created_at)}
                open={issue.id === selectedId}
                picked={bulkIds.has(issue.id)}
                onOpen={() => {
                  setSelectedId(issue.id);
                  setMobileDetail(true);
                }}
                onToggleBulk={toggleBulk}
              />
            ))}
          </div>
        )}
      </SecondarySidebar>

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
            {/* En-tête SANS bordure : c'est le fondu du contenu qui dit qu'il
                continue au-dessus, et une barre séparée le couperait de ce
                qu'il coiffe (même parti que la pull request et la conversation
                d'agent). */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3 md:px-6">
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

            <div
              ref={detailFade.ref}
              {...detailFade.scrollProps}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6"
            >
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
                    mentions={mentions}
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
                      projectId={selected.project_id}
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
                      projectId={selected.project_id}
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
            className="w-full rounded-lg border border-input bg-control px-3 py-2 text-sm outline-none [&:empty]:before:text-muted-foreground/60 focus-visible:border-ring"
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

      {bulkIssues.length > 0 && (
        <BulkIssueActions
          surface="triage"
          count={bulkIssues.length}
          members={members}
          onUpdate={updateBulk}
          onDelete={async () => {
            await Promise.all(bulkIssues.map((issue) => deleteIssue(issue.id)));
            clearBulk();
          }}
          onClear={clearBulk}
          onAskNumo={() => handleAskNumo(bulkIssues)}
          // Triage mono-projet : tous ses objectifs sont proposables. Pas de
          // ligne de cycle en revanche — un ticket en triage n'y est pas
          // éligible (voir CYCLE_INELIGIBLE_STATUSES).
          objectives={objectives}
          onLink={bulkLink}
        />
      )}
    </div>
    </AskNumoProvider>
  );
}

/**
 * Une ligne de la colonne de triage. Composant à part parce qu'elle s'inscrit
 * comme cible de « @ » (un hook par ligne, impossible dans un `.map`).
 *
 * Clic = ouvrir le ticket à droite ; Maj+clic = le prendre dans la sélection
 * groupée, exactement comme une carte du board.
 */
function TriageRow({
  issue,
  identifier,
  createdLabel,
  open,
  picked,
  onOpen,
  onToggleBulk,
}: {
  issue: Issue;
  identifier: string;
  createdLabel: string;
  /** Le ticket affiché dans le volet de détail. */
  open: boolean;
  /** Pris dans la sélection groupée. */
  picked: boolean;
  onOpen: () => void;
  onToggleBulk: (issueId: string) => void;
}) {
  const askNumoRef = useAskNumoTarget(issue);
  return (
    <button
      ref={askNumoRef}
      type="button"
      aria-pressed={picked}
      onClick={(e) => {
        if (e.shiftKey) {
          e.preventDefault();
          onToggleBulk(issue.id);
          return;
        }
        onOpen();
      }}
      className={cn(
        "flex flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
        open && "bg-muted",
        !open && !picked && "hover:bg-muted/60 focus-visible:bg-muted/60",
        // Prise dans la sélection : la même teinte que la carte prise sur le
        // board. Le ticket ouvert le reste visiblement s'il est aussi pris —
        // sinon la colonne ne dirait plus ce que montre le volet de droite.
        picked && "bg-primary/10",
        picked && open && "ring-1 ring-primary/40"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {identifier}
        </span>
        <IntegrationIndicator issue={issue} />
        <RemoteIssueIndicator issue={issue} />

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {issue.priority !== "none" && (
            <PriorityIndicator priority={issue.priority} className="size-3.5" />
          )}
          <span className="text-xs text-muted-foreground">{createdLabel}</span>
        </span>
      </div>
      <span className="line-clamp-2 text-sm font-medium">{issue.title}</span>
    </button>
  );
}
