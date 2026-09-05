"use client";

import { createContext, Fragment, useContext, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from "mangue-ui";
import { groupWorkEvents, type WorkEvent } from "@/lib/work-event-groups";

const GroupedActionsContext = createContext(false);
export const useGroupedActions = () => useContext(GroupedActionsContext);

/** Action groups live inside the turn accordion, separated only by narration. */
export function WorkEvents({ events }: { events: WorkEvent<ReactNode>[] }) {
  const t = useTranslations("ToolCall");
  return groupWorkEvents(events).map((group) => {
    const content = group.events.map((event) => (
      <Fragment key={event.key}>{event.content}</Fragment>
    ));
    return group.count > 1 ? (
      <Collapsible key={group.key}>
        <CollapsibleTrigger className="group flex w-full items-center gap-2 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground">
          <ChevronRight className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
          <span className={cn(group.active && "text-shimmer")}>
            {t("toolCallSummary", { count: group.count })}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <GroupedActionsContext value={true}>
            <div className="ml-5 flex flex-col gap-3 pt-2">{content}</div>
          </GroupedActionsContext>
        </CollapsibleContent>
      </Collapsible>
    ) : (
      <Fragment key={group.key}>{content}</Fragment>
    );
  });
}
