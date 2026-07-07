"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import { Button, ConfirmDeleteDialog, Skeleton, toast } from "mangue-ui";
import { Check, Filter, X } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { useTriageQuery } from "@/lib/use-triage-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { CreateIssueDialog } from "@/components/create-issue-dialog";
import type { TriageItem } from "@/lib/types";

export default function TriagePage() {
  const t = useTranslations("Triage");
  const format = useFormatter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { projects, loading: projectsLoading } = useProjects();
  const project = projects.find((p) => p.id === projectId);

  const { items, loading, acceptItem, rejectItem } = useTriageQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);
  const { categories } = useCategoriesQuery(projectId);
  const { objectives } = useObjectivesQuery(projectId);

  const [accepting, setAccepting] = useState<TriageItem | null>(null);
  const [toReject, setToReject] = useState<TriageItem | null>(null);

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

  const fmt = (at: string): string =>
    format.dateTime(new Date(at), {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <h1 className="mb-5 font-display text-xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Filter className="size-6" />
              </div>
              <p className="max-w-xs text-sm text-muted-foreground">{t("emptyState")}</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("sourceLabel", { source: item.source })} · {fmt(item.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setAccepting(item)}>
                      <Check />
                      {t("accept")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => setToReject(item)}
                    >
                      <X />
                      {t("reject")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateIssueDialog
        open={!!accepting}
        onOpenChange={(next) => {
          if (!next) setAccepting(null);
        }}
        members={members}
        categories={categories}
        objectives={objectives}
        initialTitle={accepting?.title}
        initialDescription={accepting?.description ?? undefined}
        onCreate={async (input) => {
          if (!accepting) return;
          const issue = await acceptItem(accepting.id, input);
          // Close ourselves: "create and keep adding" makes no sense here —
          // the item is gone after the first accept.
          setAccepting(null);
          return issue;
        }}
      />

      <ConfirmDeleteDialog
        open={!!toReject}
        onOpenChange={(next) => {
          if (!next) setToReject(null);
        }}
        title={toReject ? t("rejectConfirmTitle", { title: toReject.title }) : ""}
        description={t("rejectConfirmDescription")}
        confirmLabel={t("reject")}
        onConfirm={async () => {
          if (!toReject) return;
          try {
            await rejectItem(toReject.id);
            toast.success(t("rejectedToast"));
            setToReject(null);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </div>
  );
}
