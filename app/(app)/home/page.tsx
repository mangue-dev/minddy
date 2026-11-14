"use client";

import { PAGE_HEADING_GAP, PAGE_SCROLL, PAGE_TITLE } from "@/components/page-heading";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { useAuth } from "@/lib/auth-context";
import { displayName } from "@/lib/display-name";
import { pickGreeting } from "@/lib/home-greeting";
import { useAssistantPanel, useSuppressAssistantFab } from "@/lib/assistant-panel-context";
import { AssistantChatProvider, useAssistantChatContext } from "@/lib/assistant-chat-context";
import { AssistantComposerProvider } from "@/lib/assistant-composer-context";
import { useAiSurfaceAvailability } from "@/lib/use-ai-surface-availability";
import { useHomeBriefQuery } from "@/lib/use-home-brief-query";
import { mentionsSettled } from "@/lib/mention-resolution";
import { cn } from "@/lib/utils";
import { AppContentHeader } from "@/components/app-content-header";
import { AssistantShell, type AssistantShellHandle } from "@/components/assistant/assistant-shell";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HomeNumoBrief } from "@/components/home/home-numo-brief";
import { NumoIntro } from "@/components/assistant/numo-intro";
import { PendingInvitationsBanner } from "@/components/pending-invitations-banner";
import { HomeSmartAssignWarning } from "@/components/home/home-smart-assign-warning";
import { HomeAiInstructionProposals } from "@/components/home/home-ai-instruction-proposals";
import { DesktopInstallBanner } from "@/components/home/desktop-install-banner";
import { MobileInstallHint } from "@/components/home/mobile-install-hint";

type AuthMeta = { display_name?: string; full_name?: string; name?: string };

// Resolve local time after hydration and keep the greeting stable for this visit.
function useGreeting(name: string): { greeting: string; settled: boolean } {
  const t = useTranslations("Home");
  const [seed, setSeed] = useState<number | null>(null);
  useEffect(() => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  }, []);

  if (seed === null) {
    return { greeting: name ? t("greeting", { name }) : t("greetingNoName"), settled: false };
  }
  const variant = pickGreeting(new Date(), seed);
  return { greeting: t(name ? variant.key : variant.keyNoName, { name }), settled: true };
}

/** The longest the page waits before showing what it has. */
const REVEAL_CAP_MS = 1500;

/**
 * Home arrives in one step. Its parts come from different places (the
 * session for the name, the time of day for the greeting, Numo's word and
 * its suggestions from the server, the names of the word's mentions from
 * another request), and shown as each one lands, the page rewrote itself
 * three or four times in a second: a generic greeting and the fixed
 * suggestions, then the name, then the word with placeholder pills, then
 * the pills' names. The page now waits for all of them, at most
 * `REVEAL_CAP_MS`, and reveals them together. Once shown it stays shown:
 * a later version of the word replaces the old one in place.
 */
function useHomeReveal(inputsReady: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const cap = setTimeout(() => setReady(true), REVEAL_CAP_MS);
    return () => clearTimeout(cap);
  }, [ready]);
  useEffect(() => {
    if (ready || !inputsReady) return;
    let cancelled = false;
    // One frame first: the word's pills mount, still hidden, and queue the
    // lookup of their names, which `mentionsSettled` then waits for.
    const frame = requestAnimationFrame(() => {
      void mentionsSettled().then(() => {
        if (!cancelled) setReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [inputsReady, ready]);
  return ready;
}

/** The same fade, blur and rise as the suggestion rows above the composer. */
const REVEAL_CLASS =
  "transition-[opacity,filter,translate] duration-200 ease-out motion-reduce:transition-none motion-reduce:blur-none motion-reduce:translate-y-0";

/**
 * Home is a Numo conversation (MIN-930): the same view as the Numo panel,
 * without the panel's header, but with a conversation of its own. It never
 * picks up the panel's thread, and the panel never picks up Home's: each
 * one keeps its own state (`AssistantChatProvider standalone`) and its own
 * draft (`AssistantComposerProvider`). Each time
 * Home is shown it opens a new conversation, unless a reply is still
 * running (see `startFresh` in the shell); the one before stays in the
 * history.
 *
 * The new conversation opens with the greeting and Numo's summary of its
 * journal when Numo has written one. Once the user writes, the summary
 * stays on top as Numo's opening message, under the greeting; without a
 * summary, the greeting leaves. No banner or notice sits in it: the page is a
 * conversation. The suggestions above the composer are the ones Numo wrote
 * with its summary, or the fixed home set until it has written any. Without
 * an AI provider there is no conversation: Home keeps the greeting and the
 * account notices.
 */
export default function HomePage() {
  return (
    // Its own conversation AND its own unsent draft: what is typed in the
    // panel's composer never shows up in Home's, nor the reverse.
    <AssistantChatProvider standalone>
      <AssistantComposerProvider>
        <HomeConversation />
      </AssistantComposerProvider>
    </AssistantChatProvider>
  );
}

function HomeConversation() {
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
  const { greeting, settled: greetingSettled } = useGreeting(name);
  const { brief, loading: briefLoading } = useHomeBriefQuery(!!user);
  const shellRef = useRef<AssistantShellHandle>(null);
  // The page IS the conversation: the floating button would open it twice.
  useSuppressAssistantFab(true);
  // The open panel owns the keyboard while it covers Home.
  const { isOpen: panelOpen } = useAssistantPanel();
  const { state: chat, isBusy } = useAssistantChatContext();
  // Already on a blank conversation: starting another would change nothing.
  const blankConversation = !chat.conversationId && chat.messages.length === 0 && !isBusy;
  const aiAvailability = useAiSurfaceAvailability("assistant");
  const aiUnavailable = !aiAvailability.loading && !aiAvailability.available;
  const revealed = useHomeReveal(!!user && greetingSettled && !briefLoading && !aiAvailability.loading);
  const reveal = cn(REVEAL_CLASS, revealed ? "opacity-100" : "translate-y-1.5 opacity-0 blur-[6px]");

  // Left-aligned, like the composer and the messages below it. The page's
  // heading is the greeting, kept for screen readers whatever is shown.
  const welcome = (
    <p aria-hidden className={cn("w-full text-left", PAGE_TITLE)}>
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
            <div className={cn("flex flex-col", PAGE_HEADING_GAP, reveal)} aria-busy={!revealed}>
              {welcome}
              {/* Until Numo has a word of its own, it introduces itself. */}
              {brief ? <HomeNumoBrief brief={brief} /> : briefLoading ? null : <NumoIntro />}
            </div>
          }
          // Once you write, Numo's word stays as the opening message of the
          // conversation, with the greeting above it; without a word, the
          // greeting leaves too and the conversation starts with your message.
          keptHeader={brief ? welcome : null}
          keptIntro={brief ? <HomeNumoBrief brief={brief} /> : null}
          // Numo receives it too: the conversation opens with it (MIN-933).
          openingBriefId={brief?.id ?? null}
          // What the word cites leads the "@" menu (MIN-969).
          citedByNumo={brief?.content ?? null}
          starterItems={brief ? brief.suggestions : null}
          // The suggestions come in with the rest of the page.
          startersPending={briefLoading || !revealed}
          // On a phone the rows give their room to the keyboard while you write.
          hideStartersWhileComposing
          unavailableFallback={
            <div className="h-full overflow-y-auto">
              <div className={cn("mx-auto box-content flex max-w-content min-w-0 flex-col", PAGE_SCROLL, PAGE_HEADING_GAP, reveal)}>
                {welcome}
                <div className="flex flex-col gap-3">
                  <PendingInvitationsBanner />
                  <HomeSmartAssignWarning />
                  <HomeAiInstructionProposals />
                  <DesktopInstallBanner />
                  <MobileInstallHint key={user?.id} />
                </div>
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
