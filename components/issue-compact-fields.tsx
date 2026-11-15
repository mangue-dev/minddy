"use client";

// The create-issue dialog's inline row of pickers (Figma: assets/figma/New
// issue minddy.png), and its Smart Fill badge. The pickers are the "compact"
// variant of issue-field-pickers.tsx: icon-representable fields show their
// indicator alone (status/priority, effort triangle, category dot, avatar).

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Heading01Icon, Tag01Icon, Target01Icon, UserCircleIcon, Link02Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Kbd } from "@/components/ui/kbd";
import { matchesModShiftCombo } from "@/lib/keyboard/mod-combo";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";
import { captureWritingSpot, restoreWritingSpot, type WritingSpot } from "@/lib/keyboard/writing-spot";
import { DATE_ICON, SMART_ASSIGN_ICON, SMART_FILL_ICON } from "@/components/feature-icons";
import type { IssueStatus, IssuePriority, IssueEffort } from "@/lib/issue-constants";
import {
  StatusIndicator,
  PriorityIndicator,
  RelationIcon,
} from "@/components/issue-indicators";
import type { RelationMenuKind } from "@/lib/issue-hierarchy";
import { IssueActionsMenu, type ContextMenuAction } from "@/components/issue-context-menu";
import {
  AssigneePicker,
  CategoriesPicker,
  DueDatePicker,
  EffortPicker,
  FIELD_TRIGGER,
  ObjectivePicker,
  PriorityPicker,
  StatusPicker,
} from "@/components/issue-field-pickers";
import {
  EFFORT_OPTION_ICON,
  categoryFieldOptions,
  effortFieldOptions,
  fieldMenuChildren,
  memberFieldOptions,
  objectiveFieldOptions,
  priorityFieldOptions,
  statusFieldOptions,
  toggleCategory,
} from "@/components/issue-field-options";
import { useOrderedObjectives } from "@/lib/use-ordered-objectives";
import { UserAvatar } from "@/components/user-avatar";
import type { Category, Member, Objective } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SMART_FILL_PILL =
  "flex h-8 items-center gap-1.5 rounded-full bg-transparent px-3 text-sm text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 aria-expanded:bg-muted/40 max-sm:h-9";

type CompactProps<P> = Omit<P, "variant">;

export function StatusCompact(props: CompactProps<ComponentProps<typeof StatusPicker>>) {
  return <StatusPicker variant="compact" {...props} />;
}

export function PriorityCompact(props: CompactProps<ComponentProps<typeof PriorityPicker>>) {
  return <PriorityPicker variant="compact" {...props} />;
}

export function EffortCompact(props: CompactProps<ComponentProps<typeof EffortPicker>>) {
  return <EffortPicker variant="compact" {...props} />;
}

export function CategoriesCompact(props: CompactProps<ComponentProps<typeof CategoriesPicker>>) {
  return <CategoriesPicker variant="compact" {...props} />;
}

export function AssigneeCompact(props: CompactProps<ComponentProps<typeof AssigneePicker>>) {
  return <AssigneePicker variant="compact" {...props} />;
}

export function DueDateCompact(props: CompactProps<ComponentProps<typeof DueDatePicker>>) {
  return <DueDatePicker variant="compact" {...props} />;
}

export function ObjectiveCompact(props: CompactProps<ComponentProps<typeof ObjectivePicker>>) {
  return <ObjectivePicker variant="compact" {...props} />;
}

/**
 * What the Smart Fill menu sets by hand (MIN-809). Smart Fill only fills what
 * is still empty, so a value chosen here wins and brings its property back
 * into the form row (MIN-746). Status, assignee and due date stay in the row
 * whatever Smart Fill does; the menu offers them too, so one shortcut reaches
 * every property.
 */
export interface SmartFillManualFields {
  status?: IssueStatus;
  onStatusChange?: (v: IssueStatus) => void;
  assigneeId?: string | null;
  members?: Member[];
  onAssigneeChange?: (id: string | null) => void;
  /** The project's Smart Assign fills an empty assignee (MIN-811): the empty
   *  entry reads "Smart Assign" instead of "Unassigned", as in the row. */
  smartAssign?: boolean;
  /** Opens the due date picker; runs once the menu has closed, so the
   *  calendar keeps the focus. */
  onDueDateRequest?: () => void;
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
  /**
   * The relation types Smart Fill would otherwise link: choosing one opens
   * the picker on its targets. Given only while Smart Fill links related
   * issues; `onRequest` runs once the menu has closed, so the picker keeps
   * the focus.
   */
  relations?: { kinds: readonly RelationMenuKind[]; onRequest: (kind: RelationMenuKind) => void };
}

/**
 * One submenu per property Smart Fill would fill, as the actions of a
 * searchable menu (the issue card's): typing finds a value inside the
 * submenus. Only real values are offered: "no priority", "not set" and "no
 * objective" are exactly what Smart Fill fills, so choosing them here would
 * change nothing. Clearing a value stays in the property's own picker once it
 * is back in the row.
 */
function useSmartFillManualActions(manual: SmartFillManualFields | undefined): ContextMenuAction[] {
  const tField = useTranslations("Field");
  const tPriority = useTranslations("Priority");
  const tStatus = useTranslations("Status");
  const tRelations = useTranslations("Relations");
  const t = useTranslations("IssueUI");
  const orderedObjectives = useOrderedObjectives(manual?.objectives ?? []);
  if (!manual) return [];
  const actions: ContextMenuAction[] = [];
  if (manual.onTitleRequest) {
    actions.push({
      id: "smart-fill-title",
      label: tField("title"),
      icon: <HugeiconsIcon icon={Heading01Icon} className="size-4 text-muted-foreground" />,
      // The menu has closed: the caret goes to the title field it brought back.
      transfersFocus: true,
      onSelect: () => {
        manual.onTitleRequest?.();
        requestAnimationFrame(() => manual.onTitleFocus?.());
      },
    });
  }
  const { onStatusChange, onAssigneeChange, onDueDateRequest } = manual;
  if (onStatusChange) {
    actions.push({
      id: "smart-fill-status",
      label: tField("status"),
      icon: <StatusIndicator status={manual.status ?? "todo"} className="size-4" />,
      children: fieldMenuChildren("smart-fill-status", statusFieldOptions(tStatus), {
        isChecked: (value) => manual.status === value,
        onSelect: (value) => onStatusChange(value as IssueStatus),
      }),
    });
  }
  actions.push(
    {
      id: "smart-fill-priority",
      label: tField("priority"),
      icon: <PriorityIndicator priority={manual.priority} className="size-4" />,
      children: fieldMenuChildren(
        "smart-fill-priority",
        priorityFieldOptions(tPriority).filter((p) => p.value !== "none"),
        {
          isChecked: (value) => manual.priority === value,
          onSelect: (value) => manual.onPriorityChange(value as IssuePriority),
        },
      ),
    },
    {
      id: "smart-fill-effort",
      label: tField("effort"),
      icon: EFFORT_OPTION_ICON,
      children: fieldMenuChildren("smart-fill-effort", effortFieldOptions(), {
        isChecked: (value) => manual.effort === value,
        onSelect: (value) => manual.onEffortChange(value as IssueEffort),
      }),
    },
    {
      id: "smart-fill-categories",
      label: tField("categories"),
      icon: <HugeiconsIcon icon={Tag01Icon} className="size-4 text-muted-foreground" />,
      children: manual.categories.length === 0
        ? [{ id: "smart-fill-no-categories", label: t("noCategoriesHint"), disabled: true }]
        : fieldMenuChildren("smart-fill-category", categoryFieldOptions(manual.categories), {
            isChecked: (id) => manual.categoryIds.includes(id),
            onSelect: (id) => manual.onCategoryIdsChange(toggleCategory(manual.categoryIds, id)),
            keepOpen: true,
          }),
    },
  );
  if (onAssigneeChange && manual.members && manual.members.length > 0) {
    // Same faces and empty entry as the row's picker: unlike the properties
    // Smart Fill infers, an empty assignee is a choice (Smart Assign or nobody).
    const current = manual.members.find((m) => m.user_id === manual.assigneeId) ?? null;
    const emptyIcon = (
      <HugeiconsIcon
        icon={manual.smartAssign ? SMART_ASSIGN_ICON : UserCircleIcon}
        strokeWidth={1.75}
        className="size-4 text-muted-foreground"
      />
    );
    actions.push({
      id: "smart-fill-assignee",
      label: tField("assignee"),
      icon: current ? <UserAvatar seed={current.avatar_seed} className="size-4" /> : emptyIcon,
      children: [
        {
          id: "smart-fill-assignee-none",
          label: manual.smartAssign ? tField("smartAssign") : tField("unassigned"),
          icon: emptyIcon,
          checked: !current,
          onSelect: () => onAssigneeChange(null),
        },
        ...fieldMenuChildren(
          "smart-fill-assignee",
          memberFieldOptions(manual.members, { avatarClassName: "size-4" }),
          { isChecked: (id) => current?.user_id === id, onSelect: onAssigneeChange },
        ).map((action, index) => ({ ...action, separatorBefore: index === 0 })),
      ],
    });
  }
  const relations = manual.relations;
  if (relations && relations.kinds.length > 0) {
    actions.push({
      id: "smart-fill-relations",
      label: tRelations("relations"),
      icon: <HugeiconsIcon icon={Link02Icon} className="size-4 text-muted-foreground" />,
      children: relations.kinds.map((kind) => ({
        id: `smart-fill-relation-${kind}`,
        label: tRelations(kind),
        icon: <RelationIcon relation={kind} className="size-4" />,
        // The palette opens on this type's targets once the menu has closed.
        transfersFocus: true,
        onSelect: () => relations.onRequest(kind),
      })),
    });
  }
  if (onDueDateRequest) {
    actions.push({
      id: "smart-fill-due-date",
      label: tField("dueDate"),
      icon: <HugeiconsIcon icon={DATE_ICON} className="size-4 text-muted-foreground" />,
      // The calendar opens once the menu has closed.
      transfersFocus: true,
      onSelect: onDueDateRequest,
    });
  }
  // The objective comes last, as in the form row.
  if (orderedObjectives.length > 0) {
    actions.push({
      id: "smart-fill-objective",
      label: tField("objective"),
      icon: <HugeiconsIcon icon={Target01Icon} className="size-4 text-muted-foreground" />,
      children: fieldMenuChildren(
        "smart-fill-objective",
        objectiveFieldOptions(orderedObjectives, { presentation: "menu" }),
        { isChecked: (id) => manual.objectiveId === id, onSelect: manual.onObjectiveChange },
      ),
    });
  }
  return actions;
}

/** ⌘⇧F / Ctrl+Shift+F opens the manual menu while Smart Fill is on (F for
 *  Fill: P, R, A, L, D and K already belong to the creation dialog). */
const SMART_FILL_SHORTCUT_KEY = "f";

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
  actions: customActions,
  hints,
  shortcut = false,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  fullWidth?: boolean;
  /** ⌘⇧F opens the manual menu, shown in the chevron half while Smart Fill
   *  is on. Closing it returns to the text exactly where the caret was. */
  shortcut?: boolean;
  /** The account lets Smart Fill write an empty title (MIN-798). */
  writesTitle?: boolean;
  /** Values the chevron menu sets by hand; without it, the badge is a toggle alone. */
  manual?: SmartFillManualFields;
  /** The chevron menu of another entity (an objective, MIN-919), in place of
   *  the issue's `manual` fields. */
  actions?: ContextMenuAction[];
  /** The tooltips of another entity, in place of the issue's. */
  hints?: { on: string; off: string };
}) {
  const t = useTranslations("IssueUI");
  const id = useId();
  const manualActions = useSmartFillManualActions(manual);
  const actions = customActions ?? manualActions;
  const hasMenu = !!manual || !!customActions;
  const mod = useModKey();
  const [menuOpen, setMenuOpen] = useState(false);
  // Set only when the shortcut opened the menu, as for the project picker.
  const writingSpot = useRef<WritingSpot | null>(null);
  const shortcutActive = shortcut && value && hasMenu && !fullWidth;
  useEffect(() => {
    if (!shortcutActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !matchesModShiftCombo(event, SMART_FILL_SHORTCUT_KEY)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setMenuOpen((wasOpen) => {
        if (!wasOpen) writingSpot.current = captureWritingSpot();
        return !wasOpen;
      });
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [shortcutActive]);
  const menu = (trigger: React.ReactNode) => (
    <IssueActionsMenu
      trigger={trigger}
      actions={actions}
      align="end"
      searchable
      open={menuOpen}
      onOpenChange={(next) => {
        if (next) writingSpot.current = null;
        setMenuOpen(next);
      }}
      onCloseAutoFocus={(event) => {
        const spot = writingSpot.current;
        writingSpot.current = null;
        if (!spot) return;
        event.preventDefault();
        restoreWritingSpot(spot);
      }}
    />
  );
  if (fullWidth) return <div className="creation-smart-fill">
    <label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-2 text-sm">
      <HugeiconsIcon icon={SMART_FILL_ICON} className="size-4 shrink-0" />{t("smartFillChip")}
    </label>
    {hasMenu && menu(
      <button type="button" aria-label={t("smartFillManualAria")} className={FIELD_TRIGGER.compact}>
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-muted-foreground" />
      </button>,
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
          className={cn(SMART_FILL_PILL, tint, hasMenu && "rounded-r-none pr-2")}
        >
          <HugeiconsIcon icon={SMART_FILL_ICON} className="size-4 shrink-0" />
          <span>{t("smartFillChip")}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {hints
          ? value ? hints.on : hints.off
          : value
            ? writesTitle ? t("smartFillOnTitleHint") : t("smartFillOnHint")
            : t("smartFillOffHint")}
      </TooltipContent>
    </Tooltip>
  );
  if (!hasMenu) return toggle;
  return (
    <div data-slot="smart-fill-split" className="inline-flex gap-px">
      {toggle}
      <Tooltip>
        {menu(
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("smartFillManualAria")}
              className={cn(SMART_FILL_PILL, tint, "rounded-l-none px-2")}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0" />
              {shortcutActive && (
                <span aria-hidden className="inline-flex shrink-0 items-center gap-0.5 opacity-60">
                  <Kbd size="sm">{mod}</Kbd>
                  <Kbd size="sm">⇧</Kbd>
                  <Kbd size="sm">F</Kbd>
                </span>
              )}
            </button>
          </TooltipTrigger>,
        )}
        <TooltipContent>{t("smartFillManualAria")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
