"use client";

import { PAGE_HEADING_GAP, PAGE_SCROLL, PAGE_TITLE } from "@/components/page-heading";
import { useEffect, useRef, useState, type RefObject } from "react";
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
import { mediaSettled } from "@/lib/media-settled";
import { markPageContentShown } from "@/lib/mobile/launch-cover";
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
 * `REVEAL_CAP_MS`, and reveals them together, once the images they show
 * (a mentioned project's icon) are ready to paint. Once shown it stays shown:
 * a later version of the word replaces the old one in place.
 *
 * Until it has all its parts the intro counts as loading content
 * (`data-pending-content`), so in the mobile app the launch screen stays over
 * Home and crossfades into the finished page while the intro rises
 * (lib/mobile/launch-cover.ts). A reveal forced by the cap shows the page in
 * a browser, but does not lift the launch screen: a part is still missing.
 */
function useHomeReveal(inputsReady: boolean, intro: RefObject<HTMLElement | null>): { revealed: boolean; complete: boolean } {
  const [ready, setReady] = useState(false);
  // Revealed with all its parts, and not by the cap with what it had.
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    if (ready) return;
    const cap = setTimeout(() => setReady(true), REVEAL_CAP_MS);
    return () => clearTimeout(cap);
  }, [ready]);
  useEffect(() => {
    if (ready || !inputsReady) return;
    let cancelled = false;
    // One frame first: the word's pills mount, still hidden, and queue the
    // lookup of their names, which `mentionsSettled` then waits for, then
    // the icons those named pills show.
    const frame = requestAnimationFrame(() => {
      void mentionsSettled()
        .then(() => new Promise<void>((next) => requestAnimationFrame(() => next())))
        .then(() => (intro.current ? mediaSettled(intro.current) : undefined))
        .then(() => {
          if (cancelled) return;
          setReady(true);
          setComplete(true);
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [inputsReady, ready, intro]);
  return { revealed: ready, complete };
}

/**
 * The same fade, blur and rise as the suggestion rows above the composer,
 * applied to the whole page at once: greeting, Numo's word, suggestions and
 * composer enter together.
 */
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
  const introRef = useRef<HTMLDivElement>(null);
  const { revealed, complete } = useHomeReveal(!!user && greetingSettled && !briefLoading && !aiAvailability.loading, introRef);
  // Complete: the mobile app's launch screen need not wait for the shell's
  // other startup reads (lib/mobile/launch-cover.ts). Revealed by the cap,
  // Home is still missing a part (the name, Numo's word): the launch screen
  // then stays until the startup reads have settled, or the shell's limit.
  useEffect(() => {
    if (complete) markPageContentShown();
  }, [complete]);
  // Hidden, the page takes no tap either: the composer is already there.
  const reveal = cn(REVEAL_CLASS, revealed ? "opacity-100" : "pointer-events-none translate-y-1.5 opacity-0 blur-[6px]");

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
      {/* One entrance for the whole page: shown as each part lands, the
          composer and the suggestions used to arrive before the greeting
          and Numo's word (MIN-1006). */}
      <div className={cn("min-h-0 flex-1", reveal)}>
        <AssistantShell
          ref={shellRef}
          projectId={null}
          compact
          hideHeader
          startFresh
          displayMode="expanded"
          visible={!panelOpen}
          intro={
            <div
              ref={introRef}
              className={cn("flex flex-col", PAGE_HEADING_GAP)}
              aria-busy={!revealed}
              // Loading content until it has all its parts: the page's
              // first content, and the mobile app's launch cover, wait for
              // it, past a reveal forced by the cap.
              data-pending-content={complete ? undefined : ""}
            >
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
          // Until Numo's word is known, its suggestions are not: the rows
          // wait for it, under the page's entrance.
          startersPending={briefLoading}
          // On a phone the rows give their room to the keyboard while you write.
          hideStartersWhileComposing
          unavailableFallback={
            <div className="scrollbar-pane-inset h-full overflow-y-auto">
              <div
                className={cn("mx-auto box-content flex max-w-content min-w-0 flex-col", PAGE_SCROLL, PAGE_HEADING_GAP)}
                data-pending-content={complete ? undefined : ""}
              >
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
