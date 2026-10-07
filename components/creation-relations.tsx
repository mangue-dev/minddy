"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Link02Icon } from "@hugeicons/core-free-icons";
import { CommandGroup, CommandItem, Spinner, cn } from "mangue-ui";
import { SearchMenu } from "@/components/search-menu";
import { RelationIcon, StatusIndicator } from "@/components/issue-indicators";
import { RelationObjectiveLabel } from "@/components/relation-objective-label";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { isClosedStatus, issueIdentifier } from "@/lib/issue-constants";
import { RELATION_TYPES } from "@/lib/relation-constants";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import type { IssueRelationType, PendingRelationInput } from "@/lib/types";

type CreationRelationsProps = {
  projectId: string;
  projectKey: string;
  active: boolean;
  value: PendingRelationInput[];
  onChange: (relations: PendingRelationInput[]) => void;
  disabled?: boolean;
};

/** Draft-only picker: no relation is written until creation succeeds. */
export function CreationRelationsCompact({
  projectId,
  projectKey,
  active,
  value,
  onChange,
  disabled,
}: CreationRelationsProps) {
  const t = useTranslations("Relations");
  const tCommon = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<IssueRelationType | null>(null);
  const [query, setQuery] = useState("");
  const { issues, loading: issuesLoading } = useIssuesQuery(
    active && open ? projectId : null,
  );
  const { objectives, loading: objectivesLoading } = useObjectivesQuery(
    active && open ? projectId : null,
  );

  const resetPicker = () => {
    setOpen(false);
    setStep(null);
    setQuery("");
  };
  useEffect(() => {
    setOpen(false);
    setStep(null);
    setQuery("");
  }, [active, projectId]);

  const linked = (id: string, type: "issue" | "objective") =>
    value.some((r) =>
      r.type === step && r.target_id === id && r.target_type === type,
    );
  const issueCandidates = issues.filter(
    (i) => i.project_id === projectId && !isClosedStatus(i.status) && !linked(i.id, "issue"),
  );
  const objectiveCandidates = objectives.filter(
    (o) => o.project_id === projectId && o.status !== "done" &&
      o.status !== "canceled" && !linked(o.id, "objective"),
  );
  const select = (
    target_id: string,
    target_type: "issue" | "objective",
    target_label: string,
  ) => {
    if (!step || linked(target_id, target_type)) return;
    onChange([...value, { type: step, target_id, target_type, target_label }]);
    resetPicker();
  };
  const loading = issuesLoading || objectivesLoading;

  // A body portal avoids dialog clipping; the modal popover owns its scroll lock.
  return (
    <SearchMenu
      open={open && active}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else resetPicker();
      }}
      tooltip={t("addRelationAria")}
      searchValue={query}
      onSearchValueChange={setQuery}
      searchPlaceholder={step ? t("searchTarget") : undefined}
      contentClassName="w-80"
      modal
      hideEmpty={step !== null && loading}
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-label={t("addRelationAria")}
          className={cn(
            "flex items-center gap-1.5 rounded-md p-1.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:opacity-50 max-sm:p-2",
            value.length > 0 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <HugeiconsIcon icon={Link02Icon} className="size-[18px]" />
          <span>{t("relations")}</span>
        </button>
      }
    >
      {step === null ? (
        <CommandGroup heading={t("relations")}>
          {RELATION_TYPES.map((type) => (
            <CommandItem
              key={type}
              value={type}
              keywords={[t(`action_${type}`)]}
              onSelect={() => {
                setStep(type);
                setQuery("");
              }}
            >
              <RelationIcon relation={type} className="size-4" />
              <span>{t(type)}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : (
        <>
          {loading && (
            <div role="status" className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />{tCommon("loading")}
            </div>
          )}
          <CommandGroup heading={t(`pick_${step}`)}>
            {issueCandidates.map((issue) => {
              const identifier = issueIdentifier(projectKey, issue.number);
              return (
                <CommandItem
                  key={issue.id}
                  value={issue.id}
                  keywords={[identifier, issue.title]}
                  onSelect={() => select(issue.id, "issue", `${identifier} ${issue.title}`)}
                >
                  <StatusIndicator status={issue.status} className="size-4" />
                  <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">{identifier}</span>
                  <span className="truncate">{issue.title}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          {objectiveCandidates.length > 0 && (
            <CommandGroup heading={t("objectives")}>
              {objectiveCandidates.map((objective) => (
                <CommandItem
                  key={objective.id}
                  value={objective.id}
                  keywords={[objective.name]}
                  onSelect={() => select(objective.id, "objective", objective.name)}
                >
                  <RelationObjectiveLabel objective={objective} />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </>
      )}
    </SearchMenu>
  );
}

/** Removable context pills, positioned above the new entity's title. */
export function CreationRelationPills({
  projectId,
  projectKey,
  active,
  value,
  onChange,
  disabled,
}: CreationRelationsProps) {
  const t = useTranslations("Relations");
  const tCommon = useTranslations("Common");
  const { issues } = useIssuesQuery(active && value.length > 0 ? projectId : null);
  const { objectives } = useObjectivesQuery(active && value.length > 0 ? projectId : null);
  if (!value.length) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {value.map((relation, index) => {
        const issue = relation.target_type === "issue"
          ? issues.find((i) => i.id === relation.target_id) : null;
        const objective = relation.target_type === "objective"
          ? objectives.find((o) => o.id === relation.target_id) : null;
        const label = issue
          ? issueIdentifier(projectKey, issue.number)
          : relation.target_type === "issue"
            ? relation.target_label.split(" ")[0]
            : objective?.name ?? relation.target_label;
        const fullLabel = `${t(relation.type)}: ${label}`;
        return (
          <span
            key={`${relation.type}:${relation.target_type}:${relation.target_id}`}
            aria-label={fullLabel}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs",
              relation.type === "blocked_by"
                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                : relation.type === "blocks"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground",
            )}
          >
            <AppTooltip label={fullLabel}>
              <span className="flex min-w-0 items-center gap-1">
                <RelationIcon relation={relation.type} className="size-3" />
                <span className="truncate">{label}</span>
              </span>
            </AppTooltip>
            {!disabled && (
              <AppTooltip label={`${tCommon("remove")}: ${fullLabel}`}>
                <button
                  type="button"
                  aria-label={`${tCommon("remove")}: ${fullLabel}`}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                  className="flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                </button>
              </AppTooltip>
            )}
          </span>
        );
      })}
    </div>
  );
}
