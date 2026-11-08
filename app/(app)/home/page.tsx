"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { useAuth } from "@/lib/auth-context";
import { displayName } from "@/lib/display-name";
import { pickGreeting } from "@/lib/home-greeting";
import { useAssistantPanel, useSuppressAssistantFab } from "@/lib/assistant-panel-context";
import { useAssistantChatContext } from "@/lib/assistant-chat-context";
import { useAiSurfaceAvailability } from "@/lib/use-ai-surface-availability";
import { useHomeBriefQuery } from "@/lib/use-home-brief-query";
import { AppContentHeader } from "@/components/app-content-header";
import { AssistantShell, type AssistantShellHandle } from "@/components/assistant/assistant-shell";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HomeNumoBrief } from "@/components/home/home-numo-brief";
import { PendingInvitationsBanner } from "@/components/pending-invitations-banner";
import { HomeSmartAssignWarning } from "@/components/home/home-smart-assign-warning";
import { DesktopInstallBanner } from "@/components/home/desktop-install-banner";
import { MobileInstallHint } from "@/components/home/mobile-install-hint";

type AuthMeta = { display_name?: string; full_name?: string; name?: string };

// Resolve local time after hydration and keep the greeting stable for this visit.
function useGreeting(name: string): string {
  const t = useTranslations("Home");
  const [seed, setSeed] = useState<number | null>(null);
  useEffect(() => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  }, []);

  if (seed === null) return name ? t("greeting", { name }) : t("greetingNoName");
  const variant = pickGreeting(new Date(), seed);
  return t(name ? variant.key : variant.keyNoName, { name });
}

/**
 * Home is a Numo conversation (MIN-930): the same view as the Numo panel,
 * sharing its conversation, without the panel's header. Each time Home is
 * shown it opens a new conversation, unless a reply is still running (see
 * `startFresh` in the shell); the one before stays in the history, and a
 * conversation started here continues in the panel.
 *
 * The new conversation opens with the greeting and Numo's summary of its
 * journal when Numo has written one; both stay on top of the conversation
 * started under them. No banner or notice sits in it: the page is a
 * conversation. The suggestions above the composer are the ones Numo wrote
 * with its summary, or the fixed home set until it has written any. Without
 * an AI provider there is no conversation: Home keeps the greeting and the
 * account notices.
 */
export default function HomePage() {
  const t = useTranslations("Assistant");
  const { user } = useAuth();
  const meta = user?.user_metadata as AuthMeta | undefined;
  // Empty fallback: without name or e-mail, we greet without first name rather than injecting
  // a filler word in the sentence.
  const name = displayName(
    {
      full_name: meta?.display_name || meta?.full_name || meta?.name || null,
      email: user?.email ?? null,
    },
    "",
  );
  const greeting = useGreeting(name);
  const { brief, loading: briefLoading } = useHomeBriefQuery(!!user);
  const shellRef = useRef<AssistantShellHandle>(null);
  // The page IS the conversation: the floating button would open it twice.
  useSuppressAssistantFab(true);
  // The open panel shows the same conversation and owns the keyboard.
  const { isOpen: panelOpen } = useAssistantPanel();
  const { loadConversation, state: chat, isBusy } = useAssistantChatContext();
  // Already on a blank conversation: starting another would change nothing.
  const blankConversation = !chat.conversationId && chat.messages.length === 0 && !isBusy;
  const aiAvailability = useAiSurfaceAvailability("assistant");
  const aiUnavailable = !aiAvailability.loading && !aiAvailability.available;

  // Left-aligned, like the composer and the messages below it. The page's
  // heading is the greeting, kept for screen readers whatever is shown.
  const welcome = (
    <p aria-hidden className="w-full text-left font-display text-2xl font-semibold tracking-tight">
      {greeting}
    </p>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <h1 className="sr-only">{greeting}</h1>
      <AppContentHeader contentClassName="justify-end gap-2">
        {aiUnavailable || blankConversation ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("newConversation")}
              onClick={() => shellRef.current?.newConversation()}
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6} align="end">
            {t("newConversation")}
          </TooltipContent>
        </Tooltip>
        )}
      </AppContentHeader>
      <div className="min-h-0 flex-1">
        <AssistantShell
          ref={shellRef}
          projectId={null}
          compact
          hideHeader
          startFresh
          displayMode="expanded"
          visible={!panelOpen}
          intro={
            <div className="flex flex-col gap-6">
              {welcome}
              {brief ? (
                <HomeNumoBrief
                  brief={brief}
                  // The background conversation opens right here, in place of
                  // the new one; New conversation brings the word back.
                  onOpenConversation={(id) => void loadConversation(id, null)}
                />
              ) : null}
            </div>
          }
          starterItems={brief ? brief.suggestions : null}
          startersPending={briefLoading}
          unavailableFallback={
            <div className="flex h-full items-center justify-center overflow-y-auto px-4">
              <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-3">
                <div className="mb-2">{welcome}</div>
                <PendingInvitationsBanner />
                <HomeSmartAssignWarning />
                <DesktopInstallBanner />
                <MobileInstallHint key={user?.id} />
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
