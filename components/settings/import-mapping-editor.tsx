"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "mangue-ui";
import { ChevronDown, Sparkles } from "lucide-react";
import {
  ISSUE_EFFORTS,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  type IssueEffortValue,
  type IssuePriorityValue,
  type IssueStatusValue,
} from "@/lib/issue-validation";
import { EFFORT_MAP } from "@/lib/issue-constants";
import { normalizeToken } from "@/lib/import/normalize";
import { collectValueOptions, fieldsAvailableForColumn } from "@/lib/import/mapping";
import { topValues, type TableStats } from "@/lib/import/stats";
import {
  type ImportField,
  type ImportMapping,
  type ImportMember,
} from "@/lib/import/types";
import type { MessageKey } from "@/lib/i18n-keys";
import { AppTooltip } from "@/components/ui/app-tooltip";

/**
 * The import preview mapping table: where each column in the
 * file goes, and what each value becomes — status, priority, effort, but
 * also EACH PERSON and EACH LABEL.
 *
 * This is the only place where the import becomes repairable. Before, what no
 * alias table recognized fell without recourse: a "Level"
 * column ignored, a "Blocked" status brought back to backlog, a lost assignee, a
 * "Bugs" category created next to the "Bug" which already existed. The detection
 * fills this table, the model completes it, the user decides: the three
 * write the SAME object (`ImportMapping`), which is also what goes to the
 * server to be replayed.
 *
 * The sections are UNFOLDED and placed in a grid: two columns as soon as the
 * container has the width (the wizard), only one otherwise (the
 * settings panel). They were stacked in a folded accordion by default —
 * the most important screen of the import therefore required a click to exist, and
 * once opened, six sections in single file in a narrow column: on
 * never saw more than one question at a time. The grid is a request for
 * CONTAINER, not window: it is the space actually available which decides,
 * and the same component serves the two surfaces without knowing which one displays it.
 *
 * Everything reads `stats`, never the lines: on a file of 2,000 lines and 30
 * columns, rescanning each time the selector changes would be seen on screen.
 */

/** Radix refuses an empty `SelectItem`: the two responses that are not a target pass through a token. `UNSET` = no dictionary entry,
 * `DROP` = an empty entry, i.e. “do not resume”. */
const UNSET = "__unset__";
const DROP = "__drop__";

export function ImportMappingEditor({
  stats,
  mapping,
  members,
  categories,
  onChange,
  aiApplied,
  aiPending,
  className,
  /**
 * The settings panel keeps the accordion: the table there is one piece
 * among others in a scrolling page. The wizard has an entire
 * step for him — folding it there would only have hidden what we have just opened.
 */
  collapsible = true,
}: {
  stats: TableStats;
  mapping: ImportMapping;
  members: ImportMember[];
  categories: string[];
  onChange: (next: ImportMapping) => void;
  /** The model suggested something and it's merged into the displayed plan. */
  aiApplied: boolean;
  /** The call is in flight — the table remains usable during. */
  aiPending: boolean;
  className?: string;
  collapsible?: boolean;
}) {
  const t = useTranslations("Settings");
  const tStatus = useTranslations("Status");
  const tPriority = useTranslations("Priority");

  const values = useMemo(() => collectValueOptions(stats, mapping), [stats, mapping]);

  const usedColumns = mapping.columns.filter((f) => f !== "ignore").length;
  // An unanswered value is what this table exists to show: it is
  // count per section (the section badge) and overall (the summary).
  const unresolvedStatus = values.status.filter(
    (v) => !mapping.statusValues[normalizeToken(v)]
  ).length;
  const unresolvedPriority = values.priority.filter(
    (v) => !mapping.priorityValues[normalizeToken(v)]
  ).length;
  const unresolvedAssignee = values.assignee.filter(
    (v) => !mapping.assigneeValues[normalizeToken(v)]
  ).length;
  const unresolved = unresolvedStatus + unresolvedPriority + unresolvedAssignee;

  const setColumn = (index: number, field: ImportField) => {
    const columns = [...mapping.columns];
    columns[index] = field;
    onChange({ ...mapping, columns });
  };

  const setValue = (
    dict: keyof ImportMapping & `${string}Values`,
    raw: string,
    target: string
  ) => {
    const next = { ...(mapping[dict] as Record<string, string>) };
    const token = normalizeToken(raw);
    if (target === UNSET) delete next[token];
    else next[token] = target === DROP ? "" : target;
    onChange({ ...mapping, [dict]: next });
  };

  const fieldLabel = (field: ImportField) =>
    t(`importField_${field}` as MessageKey<"Settings">);

  const memberName = (m: ImportMember) => m.name || m.email || m.userId.slice(0, 8);

  /** What the table says about itself — at the head of the folded accordion as in
 * head of the wizard step: the same state, in the same place. */
  const summary = (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      {aiPending && (
        <span className="flex items-center gap-1">
          <Sparkles className="size-3 animate-pulse" aria-hidden />
          {t("importMappingPending")}
        </span>
      )}
      {!aiPending && aiApplied && (
        <span className="flex items-center gap-1">
          <Sparkles className="size-3" aria-hidden />
          {t("importMappingByNumo")}
        </span>
      )}
      <span>
        {t("importMappingSummary", {
          used: usedColumns,
          total: mapping.columns.length,
        })}
      </span>
      {unresolved > 0 && (
        <span className="text-amber-600 dark:text-amber-500">
          {t("importMappingUnresolved", { count: unresolved })}
        </span>
      )}
    </span>
  );

  /* The sections, without their container: the grid is a request for CONTAINER,
 so it is the width of the block - not that of the window - which decides whether there
 has one or two columns. The columns of the file take up the entire width:
 this is the question that controls all the others (a column stored
 elsewhere causes its values ​​to disappear from the adjacent sections). */
  const sections = (
    <div className={cn("@container", collapsible && "border-t border-border")}>
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-5 p-3 @xl:grid-cols-2">
        <Section
          title={t("importMappingColumnsTitle")}
          className="@xl:col-span-2"
          /* And two columns IN the section, since it takes up two: a
 Jira file has thirty headers, a single file of thirty lines
 would overwrite everything after it off the screen. */
          bodyClassName="@xl:grid @xl:grid-cols-2 @xl:gap-x-6"
        >
          {stats.map((col) => (
            <Row
              key={col.index}
              label={col.header || t("importColumnUnnamed", { index: col.index + 1 })}
              hint={topValues(col, 3)
                .map((v) => v.label)
                .join(" · ")}
            >
              <Select
                value={mapping.columns[col.index] ?? "ignore"}
                onValueChange={(v) => setColumn(col.index, v as ImportField)}
              >
                <SelectTrigger size="sm" className="w-40 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                {/* A simple field already taken by ANOTHER column is no longer suggested: `applyMapping` would never read the second,
 and nothing on the screen would say so. See
 `fieldsAvailableForColumn`. */}
                <SelectContent>
                  {fieldsAvailableForColumn(mapping.columns, col.index).map((field) => (
                    <SelectItem key={field} value={field}>
                      {fieldLabel(field)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          ))}
        </Section>

        <ValueSection
          title={t("importValuesStatus")}
          flagUnset
          values={values.status}
          dict={mapping.statusValues}
          options={ISSUE_STATUSES}
          label={(v: IssueStatusValue) => tStatus(v)}
          unsetLabel={t("importValueBacklog")}
          onSet={(raw, target) => setValue("statusValues", raw, target)}
        />
        <ValueSection
          title={t("importValuesPriority")}
          flagUnset
          values={values.priority}
          dict={mapping.priorityValues}
          options={ISSUE_PRIORITIES}
          label={(v: IssuePriorityValue) => tPriority(v)}
          unsetLabel={t("importValueNone")}
          onSet={(raw, target) => setValue("priorityValues", raw, target)}
        />
        <ValueSection
          title={t("importValuesEffort")}
          values={values.effort}
          dict={mapping.effortValues}
          options={ISSUE_EFFORTS}
          // Sizes do not translate: “XS” reads the same everywhere.
          label={(v: IssueEffortValue) => EFFORT_MAP[v].label}
          unsetLabel={t("importValueNone")}
          onSet={(raw, target) => setValue("effortValues", raw, target)}
        />
        {/* People: the file is named, the project has members. Without a
 match, the name moves to the bottom of the description. */}
        <ValueSection
          title={t("importValuesAssignee")}
          flagUnset
          values={values.assignee}
          dict={mapping.assigneeValues}
          options={members.map((m) => m.userId)}
          label={(id: string) =>
            memberName(
              members.find((m) => m.userId === id) ?? {
                userId: id,
                email: null,
                name: null,
              }
            )
          }
          unsetLabel={t("importValueNoMember")}
          onSet={(raw, target) => setValue("assigneeValues", raw, target)}
        />
        {/* Labels: brought back to an existing category, or created. */}
        <ValueSection
          title={t("importValuesLabels")}
          values={values.labels}
          dict={mapping.labelValues}
          options={categories}
          label={(name: string) => name}
          unsetLabel={t("importValueNewCategory")}
          droppable={t("importValueDropLabel")}
          onSet={(raw, target) => setValue("labelValues", raw, target)}
        />
      </div>
    </div>
  );

  if (!collapsible) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex items-center justify-end px-3">{summary}</div>
        <div className="rounded-lg border border-border">{sections}</div>
      </div>
    );
  }

  return (
    <Collapsible
      defaultOpen={unresolved > 0 || !mapping.columns.includes("title")}
      className={cn("rounded-lg border border-border", className)}
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left outline-hidden">
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
        <span className="text-sm font-medium">{t("importMappingTitle")}</span>
        <span className="ml-auto">{summary}</span>
      </CollapsibleTrigger>

      <CollapsibleContent>{sections}</CollapsibleContent>
    </Collapsible>
  );
}

/** A block of questions, with its title. */
function Section({
  title,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2", className)}>
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <div className={cn("flex flex-col gap-1.5", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * A line "what the file says → what minddy does with it".
 *
 * An unanswered line reports ON ITSELF: discreet amber background,
 * asterisk against its wording. The count at the head of the section said how many there
 * remained without ever saying which ones — on a section of twenty labels,
 * "3 values ​​to place" requires comparing each selector to the neighbor to
 * find all three. The total remains at the top of the table, where it answers another question: is there anything left to do here.
 */
function Row({
  label,
  hint,
  unresolved = false,
  children,
}: {
  label: string;
  hint?: string;
  unresolved?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("Settings");
  return (
    <div
      className={cn(
        "-mx-1.5 flex items-center gap-3 rounded-md px-1.5 py-0.5",
        unresolved && "bg-amber-500/10 dark:bg-amber-500/15"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {label}
          {unresolved && (
            // `aria-hidden` on the sign, the word `sr-only` just after:
            // “asterisk” read aloud doesn’t teach anyone anything.
            <>
              <AppTooltip label={t("importValueToPlace")}>
                <span
                  className="ml-0.5 font-medium text-amber-600 dark:text-amber-500"
                  aria-hidden
                >
                  *
                </span>
              </AppTooltip>
              <span className="sr-only"> — {t("importValueToPlace")}</span>
            </>
          )}
        </p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** The distinct values ​​of a dictionary column, and their target. */
function ValueSection<T extends string>({
  title,
  flagUnset = false,
  values,
  dict,
  options,
  label,
  unsetLabel,
  droppable,
  onSet,
}: {
  title: string;
  /**
 * An unanswered value is a HOLE in this plan. True for statuses,
 * priorities and people, where "nothing" means that we gave up to
 * place something that the file said. False for efforts and
 * labels, the absence of an answer is an answer: no effort, or
 * a category created as is.
 */
  flagUnset?: boolean;
  values: string[];
  dict: Record<string, T>;
  options: readonly T[];
  label: (value: T) => string;
  /** What happens to a value left unanswered — said, never guessed. */
  unsetLabel: string;
  /** Wording of the “do not repeat” choice, when it makes sense (labels). */
  droppable?: string;
  onSet: (raw: string, target: string) => void;
}) {
  if (values.length === 0) return null;

  return (
    <Section title={title}>
      {values.map((raw) => {
        const current = dict[normalizeToken(raw)];
        return (
          <Row key={raw} label={raw} unresolved={flagUnset && current === undefined}>
            <Select
              value={current === undefined ? UNSET : current === "" ? DROP : current}
              onValueChange={(v) => onSet(raw, v)}
            >
              <SelectTrigger size="sm" className="w-40 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>{unsetLabel}</SelectItem>
                {droppable && <SelectItem value={DROP}>{droppable}</SelectItem>}
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {label(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        );
      })}
    </Section>
  );
}
