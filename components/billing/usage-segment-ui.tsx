import {
  BotIcon,
  BubbleChatDelayIcon,
  FlowIcon,
  MessageMultiple01Icon,
  Mic01Icon,
} from "@hugeicons/core-free-icons";
import type { UsageSegmentId } from "@/lib/billing-plans";
import { AppIcon } from "@/components/icon";
import { NumoIcon } from "@/components/numo-icon";

function NumoRowIcon({
  className,
}: {
  className?: string;
  strokeWidth?: number | string;
}) {
  return <NumoIcon animated={false} className={className} />;
}

/** Stable segment identities across the meter, chart, history, and popover. */
export const SEGMENT_UI: Record<
  UsageSegmentId,
  {
    icon: AppIcon;
    text: string;
    labelKey:
      | "segmentAgents"
      | "segmentRoutines"
      | "segmentNumo"
      | "segmentDictation"
      | "segmentFeedback"
      | "segmentAutomations";
  }
> = {
  agents: {
    icon: BotIcon,
    text: "text-violet-600 dark:text-violet-400",
    labelKey: "segmentAgents",
  },
  routines: {
    icon: BubbleChatDelayIcon,
    text: "text-sky-600 dark:text-sky-400",
    labelKey: "segmentRoutines",
  },
  numo: {
    icon: NumoRowIcon,
    text: "text-blue-600 dark:text-blue-400",
    labelKey: "segmentNumo",
  },
  dictation: {
    icon: Mic01Icon,
    text: "text-amber-600 dark:text-amber-400",
    labelKey: "segmentDictation",
  },
  feedback: {
    icon: MessageMultiple01Icon,
    text: "text-emerald-600 dark:text-emerald-400",
    labelKey: "segmentFeedback",
  },
  automations: {
    icon: FlowIcon,
    text: "text-fuchsia-600 dark:text-fuchsia-400",
    labelKey: "segmentAutomations",
  },
};
