"use client";

import { PageHeading } from "@/components/page-heading";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { AppContentHeader } from "@/components/app-content-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AssistantShell, type AssistantShellHandle } from "@/components/assistant/assistant-shell";
import { AssistantChatProvider, useAssistantChatContext } from "@/lib/assistant-chat-context";
import { AssistantComposerProvider } from "@/lib/assistant-composer-context";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import type { AssistantPageContext } from "@/lib/assistant-types";
import { useAiSurfaceAvailability } from "@/lib/use-ai-surface-availability";
import { cn } from "@/lib/utils";
import { useScrollFade } from "@/lib/use-scroll-fade";
import {
  ROUTINE_EXAMPLE_CATEGORIES,
  TRIGGER_ICONS,
  routineExamplesIn,
  type RoutineExample,
  type RoutineExampleCategory,
} from "@/components/routines/routine-examples";

/** No suggestion rows above the composer: the examples sit under it. */
const NO_STARTERS: ReadonlyArray<{ label: string; prompt: string }> = [];

/**
 * The routines home (MIN-983): where a routine starts. The user describes
 * it to Numo in the full Numo composer, starts from one of the examples, or
 * sets it up by hand with "Start from scratch" (the wizard).
 *
 * Like Home, the page holds a Numo conversation of its own
 * (`AssistantChatProvider standalone`, its own draft): once the user writes,
 * the conversation takes the whole pane in expanded mode. Its messages carry
 * the `newRoutine` context, so Numo sets up a routine with `create_routine`
 * instead of doing the work once. An example fills the composer rather than
 * sending it: the user adjusts the hour or the wording first. Without an AI
 * provider there is no composer, and an example opens the wizard with its
 * instruction instead.
 */
export function RoutinesHome(props: {
  /** The project the routine goes in, when it is already known. */
  projectId: string | null;
  /** Bumped by the "+" buttons: back to a blank home, caret in the composer. */
  focusRequest?: number;
  /** Opens the manual wizard, with an example's instruction when given. */
  onStartFresh: (prompt?: string) => void;
}) {
  return (
    <AssistantChatProvider standalone>
      <AssistantComposerProvider>
        <RoutinesConversation {...props} />
      </AssistantComposerProvider>
    </AssistantChatProvider>
  );
}

function RoutinesConversation({
  projectId,
  focusRequest = 0,
  onStartFresh,
}: {
  projectId: string | null;
  focusRequest?: number;
  onStartFresh: (prompt?: string) => void;
}) {
  const t = useTranslations("Routines");
  const tAssistant = useTranslations("Assistant");
  const shellRef = useRef<AssistantShellHandle>(null);
  const ai = useAiSurfaceAvailability("assistant");
  const composerAvailable = ai.loading || ai.available;
  // The open panel owns the keyboard while it covers the page.
  const { isOpen: panelOpen } = useAssistantPanel();
  const { state: chat, isBusy } = useAssistantChatContext();
  const blankConversation = !chat.conversationId && chat.messages.length === 0 && !isBusy;
  const pageContext = useMemo<AssistantPageContext>(
    () => ({ newRoutine: true, ...(projectId ? { projectId } : {}) }),
    [projectId],
  );

  // A "+" brings back a blank home, ready to write.
  useEffect(() => {
    if (focusRequest === 0) return;
    if (!blankConversation) shellRef.current?.newConversation();
    shellRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  const pickExample = (example: RoutineExample) => {
    const prompt = t(`example_${example.id}_prompt` as "example_triage_prompt");
    if (!composerAvailable) {
      onStartFresh(prompt);
      return;
    }
    shellRef.current?.fill(prompt);
  };

  // The sidebar already holds the page's h1 ("Routines").
  const heading = <PageHeading as="h2" title={t("title")} description={t("homeSubtitle")} />;
  const examples = <RoutineExamples onPick={pickExample} />;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="routines-home">
      <AppContentHeader contentClassName="justify-end gap-2">
        {blankConversation ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={tAssistant("newConversation")}
                onClick={() => shellRef.current?.newConversation()}
              >
                <HugeiconsIcon icon={Add01Icon} className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6} align="end">
              {tAssistant("newConversation")}
            </TooltipContent>
          </Tooltip>
        )}
        <Button variant="outline" size="sm" onClick={() => onStartFresh()}>
          {t("startFresh")}
        </Button>
      </AppContentHeader>
      <div className="min-h-0 flex-1">
        <AssistantShell
          ref={shellRef}
          projectId={projectId}
          pageContext={pageContext}
          compact
          hideHeader
          startFresh
          displayMode="expanded"
          visible={!panelOpen}
          intro={heading}
          afterComposer={examples}
          composerPlaceholder={t("homePlaceholder")}
          // The page is browsed first (the examples): no caret on arrival.
          // A "+" still puts it there (`focusRequest`).
          autoFocusComposer={false}
          starterItems={NO_STARTERS}
          unavailableFallback={
            <div className="h-full overflow-y-auto">
              <div className="mx-auto box-content flex max-w-content min-w-0 flex-col gap-8 px-4 py-6 app-desktop:px-6">
                {heading}
                {examples}
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}

function RoutineExamples({ onPick }: { onPick: (example: RoutineExample) => void }) {
  const t = useTranslations("Routines");
  const [category, setCategory] = useState<RoutineExampleCategory>("featured");
  // The edge that still hides tabs fades out.
  const tabsFade = useScrollFade<HTMLDivElement>("x");
  return (
    <div className="flex flex-col gap-4">
      {/* The tabs scroll sideways on a narrow screen, faded on the side that
          still hides some; the bottom padding keeps the active tab's
          underline, drawn below the list, inside the scroller, or it would
          also scroll vertically. */}
      <Tabs value={category} onValueChange={(value) => setCategory(value as RoutineExampleCategory)}>
        <div ref={tabsFade.ref} {...tabsFade.scrollProps} className="overflow-x-auto overflow-y-hidden pb-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList variant="line" aria-label={t("homeExamples")} className="justify-start">
            {ROUTINE_EXAMPLE_CATEGORIES.map((id) => (
              <TabsTrigger key={id} value={id}>
                {t(`homeCategory_${id}` as "homeCategory_featured")}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {routineExamplesIn(category).map((example) => (
          <li key={example.id} className="flex">
            <ExampleCard example={example} onPick={() => onPick(example)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExampleCard({ example, onPick }: { example: RoutineExample; onPick: () => void }) {
  const t = useTranslations("Routines");
  const key = (part: string) => `example_${example.id}_${part}` as "example_triage_title";
  return (
    <button
      type="button"
      onClick={onPick}
      data-routine-example={example.id}
      className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left outline-none transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <HugeiconsIcon icon={example.icon} className={cn("size-5 shrink-0", example.tone)} />
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-medium">{t(key("title"))}</span>
        <span className="text-sm text-muted-foreground">{t(key("desc"))}</span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <HugeiconsIcon icon={TRIGGER_ICONS[example.trigger]} className="size-3.5 shrink-0" />
          {t(key("when"))}
        </span>
        <HugeiconsIcon icon={ArrowRight02Icon} aria-hidden className="size-3 shrink-0" />
        <span className="flex items-center gap-1.5">
          <HugeiconsIcon icon={example.actionIcon} className="size-3.5 shrink-0" />
          {t(key("action"))}
        </span>
      </span>
    </button>
  );
}
