"use client";

// Compact pickers for the create-issue dialog — the options read as one inline
// row (Figma: assets/figma/New issue minddy.png). Icon-representable fields
// show just their indicator (status/priority, effort triangle, category dot,
// avatar). Same value/onChange contracts as the side-panel fields in
// issue-property-fields.tsx.

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Heading01Icon, Tag01Icon, Target01Icon, TriangleIcon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useId, useRef } from "react";
import { DateTimePicker } from "@/components/date-time-picker";
import { SMART_ASSIGN_ICON, SMART_FILL_ICON } from "@/components/feature-icons";
import {
  SearchSelect,
  SearchMultiSelect,
  type PickerOption,
} from "@/components/search-select";
import {
  ALL_STATUSES,
  PRIORITIES,
  EFFORTS,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import {
  StatusIndicator,
  PriorityIndicator,
  EffortIndicator,
} from "@/components/issue-indicators";
import { Dot } from "@/components/issue-property-fields";
import { OBJECTIVE_PILL_TRIGGER, objectivePickerOption, ObjectivePill } from "@/components/objective-label";
import { useOrderedObjectives } from "@/lib/use-ordered-objectives";
import {
  useCategoryCreateOption,
  useObjectiveCreateOption,
} from "@/lib/use-picker-create";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import type { RecurrenceCadence } from "@/lib/recurrence";
import type { Category, Member, Objective } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// On the finger, the row of options is made of targets of 30 px, below the threshold of the
// comfortable: under `sm` each trigger gains a few guard pixels.
const BARE =
  "flex items-center gap-1.5 rounded-md p-1.5 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted max-sm:p-2";
const SMART_FILL_PILL =
  "flex h-8 items-center gap-1.5 rounded-full bg-transparent px-3 text-sm text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 aria-expanded:bg-muted/40 max-sm:h-9";

// Lets the create-issue dialog drive each picker's open state from a keyboard
// shortcut and surface the key in the trigger's tooltip. All optional — the
// pickers stay uncontrolled (click to open) when these aren't passed.
type ShortcutControl = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  shortcutHint?: string;
  /** Show the selected value in mobile creation property tiles. */
  showValue?: boolean;
};

export function StatusCompact({
  value,
  onChange,
  open,
  onOpenChange,
  shortcutHint,
  showValue = false,
}: {
  value: IssueStatus;
  onChange: (v: IssueStatus) => void;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tStatus = useTranslations("Status");
  const options: PickerOption[] = ALL_STATUSES.map((s) => ({
    value: s.value,
    label: tStatus(s.value),
    icon: <StatusIndicator status={s.value} className="size-4" />,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssueStatus)}
      options={options}
      tooltip={tField("status")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button type="button" aria-label={t("changeStatusAria")} className={BARE}>
          <StatusIndicator status={value} />
          {showValue && <span>{tStatus(value)}</span>}
        </button>
      }
    />
  );
}

export function PriorityCompact({
  value,
  onChange,
  open,
  onOpenChange,
  shortcutHint,
  showValue = false,
}: {
  value: IssuePriority;
  onChange: (v: IssuePriority) => void;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tPriority = useTranslations("Priority");
  const options: PickerOption[] = PRIORITIES.map((p) => ({
    value: p.value,
    label: tPriority(p.value),
    icon: <PriorityIndicator priority={p.value} className="size-4" />,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssuePriority)}
      options={options}
      tooltip={tField("priority")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button type="button" aria-label={t("changePriorityAria")} className={BARE}>
          <PriorityIndicator priority={value} />
          {showValue && <span>{tPriority(value)}</span>}
        </button>
      }
    />
  );
}

export function EffortCompact({
  value,
  onChange,
  open,
  onOpenChange,
  shortcutHint,
  showValue = false,
}: {
  value: IssueEffort | null;
  onChange: (v: IssueEffort | null) => void;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const options: PickerOption[] = EFFORTS.map((e) => ({
    value: e.value,
    label: e.label,
    icon: <HugeiconsIcon icon={TriangleIcon} className="size-4 text-muted-foreground" />,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssueEffort | null)}
      options={options}
      noneOption={{ label: tField("effortNone") }}
      tooltip={tField("effort")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button type="button" aria-label={t("changeEffortAria")} className={BARE}>
          {value ? (
            <EffortIndicator effort={value} className="text-foreground" />
          ) : (
            <HugeiconsIcon icon={TriangleIcon} className="size-[18px] shrink-0 text-muted-foreground" />
          )}
          {showValue && !value && <span>{tField("effortNone")}</span>}
        </button>
      }
    />
  );
}

export function CategoriesCompact({
  categories,
  value,
  onChange,
  projectId,
  open,
  onOpenChange,
  shortcutHint,
  showValue = false,
}: {
  categories: Category[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Project where quick add creates the label. */
  projectId?: string | null;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const selected = categories.filter((c) => value.includes(c.id));
  const first = selected[0];
  const extra = selected.length - 1;
  const options: PickerOption[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
    icon: <Dot color={c.color} />,
  }));
  const createOption = useCategoryCreateOption({
    projectId,
    categories,
    onCreated: (category) => onChange([...value, category.id]),
  });
  return (
    <SearchMultiSelect
      values={value}
      onChange={onChange}
      options={options}
      createOption={createOption}
      tooltip={tField("categories")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      emptyText={categories.length === 0 ? t("noCategoriesHint") : undefined}
      trigger={
        <button type="button" aria-label={t("editCategoriesAria")} className={BARE}>
          {first ? (
            <>
              <Dot color={first.color} />
              <span className="max-w-36 truncate">{first.name}</span>
              {extra > 0 && (
                <span className="shrink-0 text-muted-foreground">+{extra}</span>
              )}
            </>
          ) : (
            <HugeiconsIcon icon={Tag01Icon} className="size-[17px] shrink-0 text-muted-foreground" />
          )}
          {showValue && !first && <span>{tField("noCategories")}</span>}
        </button>
      }
    />
  );
}

export function AssigneeCompact({
  value,
  members,
  onChange,
  open,
  onOpenChange,
  shortcutHint,
  showValue = false,
  noneLabel,
  smartAssign = false,
}: {
  value: string | null;
  members: Member[];
  onChange: (v: string | null) => void;
  /** Overrides the "clear" option's label (e.g. "No lead" for objectives). */
  noneLabel?: string;
  /** The project's Smart Assign fills an empty assignee (MIN-811): the
      "clear" option reads "Smart Assign" instead of "Unassigned". */
  smartAssign?: boolean;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const current = members.find((m) => m.user_id === value) ?? null;
  const emptyLabel = smartAssign ? tField("smartAssign") : noneLabel ?? tField("unassigned");
  const emptyIcon = smartAssign ? SMART_ASSIGN_ICON : UserCircleIcon;
  const options: PickerOption[] = members.map((m) => ({
    value: m.user_id,
    label: displayName(m),
    keywords: m.email ? [m.email] : undefined,
    icon: (
      <UserAvatar
        seed={m.avatar_seed}
        className="size-5"
      />
    ),
  }));
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      noneOption={{
        label: emptyLabel,
        icon: smartAssign ? (
          <HugeiconsIcon icon={SMART_ASSIGN_ICON} strokeWidth={1.75} className="size-[18px] shrink-0 text-muted-foreground" />
        ) : undefined,
      }}
      tooltip={tField("assignee")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button type="button" aria-label={t("changeAssigneeAria")} className={BARE}>
          {current ? (
            <UserAvatar
              seed={current.avatar_seed}
              className="size-5"
            />
          ) : (
            <HugeiconsIcon icon={emptyIcon} strokeWidth={1.75} className="size-[18px] shrink-0 text-muted-foreground" />
          )}
          {showValue && <span>{current ? displayName(current) : emptyLabel}</span>}
        </button>
      }
    />
  );
}

export function DueDateCompact({
  value,
  onChange,
  recurrence,
  onRecurrenceChange,
  open,
  onOpenChange,
  shortcutHint,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  /** Opens recurring popover mode (MIN-136). */
  recurrence?: RecurrenceCadence | null;
  onRecurrenceChange?: (next: {
    due_date: string | null;
    recurrence: RecurrenceCadence | null;
  }) => void;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  return (
    <DateTimePicker
      variant="ghost"
      value={value}
      onChange={onChange}
      recurrence={recurrence}
      onRecurrenceChange={onRecurrenceChange}
      placeholder={tField("dueDate")}
      ariaLabel={t("changeDueDateAria")}
      open={open}
      onOpenChange={onOpenChange}
      tooltip={shortcutHint ? tField("dueDate") : undefined}
      shortcutHint={shortcutHint}
    />
  );
}

export function ObjectiveCompact({
  value,
  objectives,
  onChange,
  projectId,
  open,
  onOpenChange,
  shortcutHint,
  showValue = false,
}: {
  value: string | null;
  objectives: Objective[];
  onChange: (v: string | null) => void;
  /** Project where quick adding creates the goal. */
  projectId?: string | null;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const current = objectives.find((o) => o.id === value) ?? null;
  const options: PickerOption[] = useOrderedObjectives(objectives).map(objectivePickerOption);
  const createOption = useObjectiveCreateOption({
    projectId,
    onCreated: (objective) => onChange(objective.id),
  });
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      noneOption={{ label: tCommon("none") }}
      createOption={createOption}
      tooltip={tField("objective")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button
          type="button"
          aria-label={t("changeObjectiveAria")}
          className={current ? cn(OBJECTIVE_PILL_TRIGGER, "max-w-48") : BARE}
        >
          {current ? (
            <ObjectivePill objective={current} />
          ) : (
            <>
              <HugeiconsIcon icon={Target01Icon} className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{tField(showValue ? "noObjective" : "objective")}</span>
            </>
          )}
        </button>
      }
    />
  );
}

/**
 * What the Smart Fill menu sets by hand (MIN-809). Smart Fill only fills what
 * is still empty, so a value chosen here wins and brings its property back
 * into the form row (MIN-746).
 */
export interface SmartFillManualFields {
  priority: IssuePriority;
  onPriorityChange: (v: IssuePriority) => void;
  effort: IssueEffort | null;
  onEffortChange: (v: IssueEffort) => void;
  categories: Category[];
  categoryIds: string[];
  onCategoryIdsChange: (ids: string[]) => void;
  objectives: Objective[];
  objectiveId: string | null;
  onObjectiveChange: (id: string) => void;
  /**
   * Shows the title field Smart Fill would otherwise write (MIN-813). Given
   * only while Smart Fill writes the title; `onTitleFocus` runs once the menu
   * has closed, so the caret lands in the field and not back on the chevron.
   */
  onTitleRequest?: () => void;
  onTitleFocus?: () => void;
}

/**
 * One submenu per property Smart Fill would fill. Only real values are
 * offered: "no priority", "not set" and "no objective" are exactly what Smart
 * Fill fills, so choosing them here would change nothing. Clearing a value
 * stays in the property's own picker once it is back in the row.
 */
function SmartFillManualMenu({
  onTitleRequest,
  priority,
  onPriorityChange,
  effort,
  onEffortChange,
  categories,
  categoryIds,
  onCategoryIdsChange,
  objectives,
  objectiveId,
  onObjectiveChange,
}: Omit<SmartFillManualFields, "onTitleFocus">) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tPriority = useTranslations("Priority");
  const orderedObjectives = useOrderedObjectives(objectives);
  return (
    <>
      <DropdownMenuLabel>{t("smartFillManualLabel")}</DropdownMenuLabel>
      {onTitleRequest && (
        <DropdownMenuItem onSelect={onTitleRequest}>
          <HugeiconsIcon icon={Heading01Icon} className="size-4 text-muted-foreground" />
          {tField("title")}
        </DropdownMenuItem>
      )}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <PriorityIndicator priority={priority} className="size-4" />
          {tField("priority")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-48">
          <DropdownMenuRadioGroup
            value={priority}
            onValueChange={(v) => onPriorityChange(v as IssuePriority)}
          >
            {PRIORITIES.filter((p) => p.value !== "none").map((p) => (
              <DropdownMenuRadioItem key={p.value} value={p.value}>
                <PriorityIndicator priority={p.value} className="size-4" />
                {tPriority(p.value)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <HugeiconsIcon icon={TriangleIcon} className="size-4 text-muted-foreground" />
          {tField("effort")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-48">
          <DropdownMenuRadioGroup
            value={effort ?? ""}
            onValueChange={(v) => onEffortChange(v as IssueEffort)}
          >
            {EFFORTS.map((e) => (
              <DropdownMenuRadioItem key={e.value} value={e.value}>
                <HugeiconsIcon icon={TriangleIcon} className="size-4 text-muted-foreground" />
                {e.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <HugeiconsIcon icon={Tag01Icon} className="size-4 text-muted-foreground" />
          {tField("categories")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56">
          {categories.length === 0 ? (
            <DropdownMenuItem disabled>{t("noCategoriesHint")}</DropdownMenuItem>
          ) : (
            categories.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={categoryIds.includes(c.id)}
                // Several categories can apply: the menu stays open.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  onCategoryIdsChange(
                    checked
                      ? [...categoryIds, c.id]
                      : categoryIds.filter((id) => id !== c.id),
                  )
                }
              >
                <Dot color={c.color} />
                <span className="min-w-0 truncate">{c.name}</span>
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {orderedObjectives.length > 0 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon icon={Target01Icon} className="size-4 text-muted-foreground" />
            {tField("objective")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            <DropdownMenuRadioGroup value={objectiveId ?? ""} onValueChange={onObjectiveChange}>
              {orderedObjectives.map((o) => (
                <DropdownMenuRadioItem key={o.id} value={o.id}>
                  <ObjectivePill objective={o} />
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
    </>
  );
}

/**
 * Desktop uses a split badge: the left half turns Smart Fill on or off, the
 * chevron sets one of its properties by hand (MIN-809). Mobile creation uses a
 * full-width labeled switch with the same menu beside it.
 */
export function SmartFillCompact({
  value,
  onChange,
  fullWidth = false,
  writesTitle = false,
  manual,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  fullWidth?: boolean;
  /** The account lets Smart Fill write an empty title (MIN-798). */
  writesTitle?: boolean;
  /** Values the chevron menu sets by hand; without it, the badge is a toggle alone. */
  manual?: SmartFillManualFields;
}) {
  const t = useTranslations("IssueUI");
  const id = useId();
  /** Title was chosen: the closing menu hands the caret to the title field. */
  const titleChosenRef = useRef(false);
  const menu = manual && (
    <DropdownMenuContent
      align="end"
      className="w-52"
      onCloseAutoFocus={(event) => {
        if (!titleChosenRef.current) return;
        titleChosenRef.current = false;
        event.preventDefault();
        manual.onTitleFocus?.();
      }}
    >
      <SmartFillManualMenu
        {...manual}
        onTitleRequest={
          manual.onTitleRequest &&
          (() => {
            titleChosenRef.current = true;
            manual.onTitleRequest?.();
          })
        }
      />
    </DropdownMenuContent>
  );
  if (fullWidth) return <div className="creation-smart-fill">
    <label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-2 text-sm">
      <HugeiconsIcon icon={SMART_FILL_ICON} className="size-4 shrink-0" />{t("smartFillChip")}
    </label>
    {menu && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t("smartFillManualAria")} className={BARE}>
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    )}
    <Switch id={id} checked={value} onCheckedChange={onChange} />
  </div>;
  // Both halves share the badge's tint, so on or off they read as one chip.
  const tint = value
    ? "bg-primary/10 text-primary hover:bg-primary/15 aria-expanded:bg-primary/15"
    : "text-muted-foreground";
  const toggle = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={value}
          onClick={() => onChange(!value)}
          className={cn(SMART_FILL_PILL, tint, menu && "rounded-r-none pr-2")}
        >
          <HugeiconsIcon icon={SMART_FILL_ICON} className="size-4 shrink-0" />
          <span>{t("smartFillChip")}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {value
          ? writesTitle ? t("smartFillOnTitleHint") : t("smartFillOnHint")
          : t("smartFillOffHint")}
      </TooltipContent>
    </Tooltip>
  );
  if (!menu) return toggle;
  return (
    <div data-slot="smart-fill-split" className="inline-flex gap-px">
      {toggle}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("smartFillManualAria")}
                className={cn(SMART_FILL_PILL, tint, "rounded-l-none px-2")}
              >
                <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("smartFillManualAria")}</TooltipContent>
        </Tooltip>
        {menu}
      </DropdownMenu>
    </div>
  );
}
