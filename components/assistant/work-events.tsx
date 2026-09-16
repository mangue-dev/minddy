"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from "mangue-ui";
import { groupWorkEvents, workEventsRevealKey, type WorkEvent } from "@/lib/work-event-groups";
import {
  summarizeToolCalls,
  toolCallLabel,
  type ToolCallItem,
} from "@/components/assistant/tool-call-display";
import { GroupedActionsProvider } from "./grouped-actions-context";

function ActionGroup({
  group,
  children,
}: {
  group: ReturnType<typeof groupWorkEvents<ReactNode>>[number];
  children: ReactNode;
}) {
  const t = useTranslations("ToolCall");
  const revealKey = workEventsRevealKey(group.events);
  const toolCalls = group.events.flatMap((event) => event.toolCalls ?? []);
  const runningTool = [...toolCalls]
    .reverse()
    .find((call) => call.status === "running");
  // A thinking event IS an action while it runs: it takes the group heading,
  // shimmering, exactly like a running tool call would. Once it ends, it
  // leaves: the summary counts only what the tools did. And while it runs,
  // the group STAYS OPEN — the whole point of streaming the thinking live is
  // to read it, not to guess it behind a folded accordion.
  const thinking = !runningTool && group.active;
  const [open, setOpen] = useState(Boolean(revealKey) || thinking);
  const active = Boolean(runningTool) || group.active;
  const label = runningTool
    ? toolCallLabel(runningTool as ToolCallItem, t)
    : group.active
      ? t("thinking")
      : toolCalls.length > 0
        ? summarizeToolCalls(toolCalls as ToolCallItem[], t)
        : t("toolCallSummary", { count: group.count });
  useEffect(() => {
    // Results can arrive after a group mounts. Reopen for each new credential,
    // while allowing the user to close an already acknowledged callout. A
    // running thinking keeps its group open the same way.
    if (revealKey || thinking) setOpen(true);
  }, [revealKey, thinking]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground">
        <ChevronRight className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span className={cn(active && "text-shimmer")}>
          {label}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <GroupedActionsProvider value={true}>
          <div className="ml-5 flex flex-col gap-3 pt-2">{children}</div>
        </GroupedActionsProvider>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Action groups live inside the turn accordion, separated only by narration.
 *  A group that is active on thinking alone is wrapped too — the shimmering
 *  heading is what shows the thinking as the current action (a group of one
 *  completed action stays plain). */
export function WorkEvents({ events }: { events: WorkEvent<ReactNode>[] }) {
  return groupWorkEvents(events).map((group) => {
    const content = group.events.map((event) => (
      <Fragment key={event.key}>{event.content}</Fragment>
    ));
    const thinkingOnly =
      group.active && !group.events.some((event) => event.toolCalls?.length);
    return group.count > 1 || thinkingOnly ? (
      <ActionGroup key={group.key} group={group}>{content}</ActionGroup>
    ) : (
      <Fragment key={group.key}>{content}</Fragment>
    );
  });
}
