import {
  Calendar03Icon,
  CheckListIcon,
  Copy01Icon,
  Delete02Icon,
  FileEditIcon,
  FlashIcon,
  MessageMultiple01Icon,
  Notification01Icon,
  Comment01Icon,
  AlarmClockIcon,
  Sorting01Icon,
  Target02Icon,
  Link01Icon,
  MailSend01Icon,
  TaskDaily01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";

type Icon = typeof Calendar03Icon;

/** The tabs above the examples; "featured" is a curated mix of the others. */
export const ROUTINE_EXAMPLE_CATEGORIES = [
  "featured",
  "triage",
  "followUp",
  "reports",
  "planning",
] as const;
export type RoutineExampleCategory = (typeof ROUTINE_EXAMPLE_CATEGORIES)[number];

export const ROUTINE_EXAMPLE_IDS = [
  "triage",
  "duplicates",
  "stale",
  "dueDates",
  "reviews",
  "weeklyWrap",
  "objectives",
  "feedback",
  "cycle",
  "backlog",
] as const;
export type RoutineExampleId = (typeof ROUTINE_EXAMPLE_IDS)[number];

export interface RoutineExample {
  id: RoutineExampleId;
  categories: readonly RoutineExampleCategory[];
  icon: Icon;
  /** Text color class of the card's icon. Literal: Tailwind only sees literals. */
  tone: string;
  /** What starts the routine: a schedule or an event in the project. */
  trigger: "schedule" | "event";
  actionIcon: Icon;
}

/**
 * Routines a team can start from (MIN-983). They stay on the assistant's
 * side of the work — sorting, following up, reporting, planning — and only
 * use what a routine can do: a schedule or a project event, then Numo's
 * tools. The text of each one lives in the `Routines` catalog under
 * `example_<id>_*`; its `_prompt` is what lands in the composer.
 */
export const ROUTINE_EXAMPLES: readonly RoutineExample[] = [
  { id: "triage", categories: ["featured", "triage"], icon: Sorting01Icon, tone: "text-chart-1", trigger: "schedule", actionIcon: CheckListIcon },
  { id: "duplicates", categories: ["featured", "triage"], icon: Copy01Icon, tone: "text-chart-2", trigger: "event", actionIcon: Link01Icon },
  { id: "stale", categories: ["featured", "followUp"], icon: AlarmClockIcon, tone: "text-warning", trigger: "schedule", actionIcon: MailSend01Icon },
  { id: "dueDates", categories: ["featured", "followUp"], icon: Clock01Icon, tone: "text-destructive", trigger: "schedule", actionIcon: Notification01Icon },
  { id: "reviews", categories: ["followUp"], icon: Comment01Icon, tone: "text-chart-3", trigger: "schedule", actionIcon: Comment01Icon },
  { id: "weeklyWrap", categories: ["featured", "reports"], icon: FileEditIcon, tone: "text-brand", trigger: "schedule", actionIcon: FileEditIcon },
  { id: "objectives", categories: ["reports"], icon: Target02Icon, tone: "text-success", trigger: "schedule", actionIcon: MailSend01Icon },
  { id: "feedback", categories: ["reports", "triage"], icon: MessageMultiple01Icon, tone: "text-chart-4", trigger: "event", actionIcon: Link01Icon },
  { id: "cycle", categories: ["featured", "planning"], icon: TaskDaily01Icon, tone: "text-chart-5", trigger: "schedule", actionIcon: CheckListIcon },
  { id: "backlog", categories: ["planning"], icon: Delete02Icon, tone: "text-muted-foreground", trigger: "schedule", actionIcon: MailSend01Icon },
];

export const TRIGGER_ICONS = { schedule: Calendar03Icon, event: FlashIcon } as const;

export function routineExamplesIn(category: RoutineExampleCategory): RoutineExample[] {
  return ROUTINE_EXAMPLES.filter((example) => example.categories.includes(category));
}
