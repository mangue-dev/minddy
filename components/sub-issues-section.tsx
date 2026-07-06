"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Progress, Spinner, cn, toast } from "mangue-ui";
import { Plus } from "lucide-react";
import { issueIdentifier } from "@/lib/issue-constants";
import { StatusIndicator } from "@/components/issue-indicators";
import type { CreateIssueInput, Issue } from "@/lib/types";

/** Parent-side view of its children: progress + list + inline add (plan §4). */
export function SubIssuesSection({
  issue,
  allIssues,
  projectKey,
  onOpenIssue,
  onCreate,
}: {
  issue: Issue;
  allIssues: Issue[];
  projectKey: string;
  onOpenIssue: (id: string) => void;
  onCreate: (input: CreateIssueInput) => Promise<unknown>;
}) {
  const t = useTranslations("IssueUI");
  const tIssue = useTranslations("Issue");
  const tCommon = useTranslations("Common");
  const children = useMemo(
    () =>
      allIssues
        .filter((i) => i.parent_id === issue.id)
        .sort((a, b) => a.number - b.number),
    [allIssues, issue.id]
  );

  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const total = children.length;
  const done = children.filter((c) => c.status === "done").length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setAdding(true);
    try {
      // Inherit the parent's objective by default (server does this when
      // objective_id is omitted).
      await onCreate({ title: t, parent_id: issue.id });
      setTitle("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">{tIssue("subEntityPlural")}</span>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            {done}/{total}
          </span>
        )}
        {total > 0 && <Progress value={percent} className="ml-auto w-24" />}
      </div>

      {children.length > 0 && (
        <div className="mb-2 flex flex-col">
          {children.map((child) => {
            return (
              <button
                key={child.id}
                type="button"
                onClick={() => onOpenIssue(child.id)}
                className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted/60"
              >
                <StatusIndicator status={child.status} className="size-4 shrink-0" />
                <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                  {issueIdentifier(projectKey, child.number)}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    child.status === "done" && "text-muted-foreground line-through"
                  )}
                >
                  {child.title}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("addSubIssuePlaceholder")}
          className="h-8"
        />
        <Button type="submit" size="icon-sm" disabled={adding || !title.trim()} aria-label={tCommon("add")}>
          {adding ? <Spinner /> : <Plus />}
        </Button>
      </form>
    </div>
  );
}
