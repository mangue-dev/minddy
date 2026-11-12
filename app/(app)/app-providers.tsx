"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { MotionConfig } from "framer-motion";
import { OnboardingProvider } from "@/lib/use-onboarding";
import { AuthProvider } from "@/lib/auth-context";
import { AccountQueryProvider } from "@/lib/account-query-provider";
import { RealtimeProvider } from "@/lib/realtime-provider";
import { ProjectsProvider } from "@/lib/projects-context";
import { CreateProvider } from "@/lib/create-context";
import { AssistantPanelProvider } from "@/lib/assistant-panel-context";
import { AssistantChatProvider } from "@/lib/assistant-chat-context";
import { AssistantComposerProvider } from "@/lib/assistant-composer-context";
import { ScratchpadProvider } from "@/lib/scratchpad-context";
import {
  KeyboardProvider,
  useCheatsheet,
} from "@/lib/keyboard/keyboard-context";
import { SendModeBoundary } from "@/app/(app)/send-mode-boundary";
import { SecondarySidebarProvider } from "@/lib/secondary-sidebar-context";
import { SidebarVisibilityProvider } from "@/lib/sidebar-visibility-context";
import { UndoProvider } from "@/lib/undo/undo-context";
import { BulkActionsProvider } from "@/lib/bulk-actions-context";
import { PromptDeliveryProvider } from "@/lib/prompt-delivery-context";
import { CurrentViewProvider } from "@/lib/current-view-context";
import { AppTabsProvider } from "@/lib/app-tabs-context";
import { IssuePanelProvider } from "@/lib/issue-panel-context";
import { PagePanelProvider } from "@/lib/page-panel-context";
import { ResourcePreviewHost } from "@/components/resource-preview-host";
import { MentionHoverProvider } from "@/components/mention-hover";
import { MentionHoverCard } from "@/components/mention-hover-card";
import { PrUnlinkConfirmationProvider } from "@/components/pull-requests/pr-unlink-confirmation";
import { AppShellChrome } from "@/components/app-shell-chrome";
import { FirstRunGate } from "@/components/first-run/first-run-gate";
import { AssistantFab } from "@/components/assistant-fab";
import { AnalyticsProjectGroup } from "@/components/analytics-project-group";
import { PushServiceWorker } from "@/components/push-service-worker";
import { DesktopNotifications } from "@/components/desktop-notifications";
import { DesktopAnalyticsPrompt } from "@/components/desktop-analytics-prompt";
import { PushNotificationDismiss } from "@/components/push-notification-dismiss";
import { ProjectDraftResume } from "@/components/project-draft-resume";
import { ThemeAccountSync } from "@/components/theme-account-sync";
import { HapticsAccountSync } from "@/components/mobile/haptics-account-sync";
import { CommentShortcut } from "@/components/comment-shortcut";
import { loadScratchpadModal } from "@/lib/lazy-app-surfaces";
import { RememberTimeZone } from "@/components/server-seed";
import { useQueryClient } from "@tanstack/react-query";
import { useAfterFirstContent, watchFirstContent } from "@/lib/first-content";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useScratchpad } from "@/lib/scratchpad-context";

// Deferred: keeps streamdown/shiki (markdown rendering) out of the initial bundle.
const AssistantPanel = dynamic(
  () => import("@/components/assistant-panel").then((m) => m.AssistantPanel),
  { ssr: false }
);

// Deferred for the same reason (the Notes modal renders markdown).
const ScratchpadModal = dynamic(
  () => loadScratchpadModal().then((m) => m.ScratchpadModal),
  { ssr: false }
);

const KeyboardCheatsheet = dynamic(
  () =>
    import("@/components/keyboard-cheatsheet").then(
      (m) => m.KeyboardCheatsheet,
    ),
  { ssr: false },
);

/** Marks the page's first content: reads settled, no skeleton left (lib/first-content.ts). */
function FirstContentWatch() {
  const client = useQueryClient();
  useEffect(() => watchFirstContent({
    isFetching: () => client.isFetching(),
    subscribe: (notify) => client.getQueryCache().subscribe(notify),
  }), [client]);
  return null;
}

// Numo and the notebook load their code after the first content (MIN-880),
// or at once when opened earlier. Once mounted they stay mounted.
function DeferredAssistantPanel() {
  const { isOpen } = useAssistantPanel();
  const ready = useAfterFirstContent();
  const [mounted, setMounted] = useState(false);
  if ((ready || isOpen) && !mounted) setMounted(true);
  return mounted ? <AssistantPanel /> : null;
}

function DeferredScratchpadModal() {
  const { isOpen } = useScratchpad();
  const ready = useAfterFirstContent();
  const [mounted, setMounted] = useState(false);
  if ((ready || isOpen) && !mounted) setMounted(true);
  return mounted ? <ScratchpadModal /> : null;
}

function DeferredKeyboardCheatsheet() {
  const { open } = useCheatsheet();
  // Loaded on first open, then kept mounted so the panel can animate out.
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened ? <KeyboardCheatsheet /> : null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    // `prefers-reduced-motion` stops CSS animations in app/tokens.css, but
    // framer-motion animates from script: "user" drops its transform and layout
    // animations for the whole signed-in app when the system asks (MIN-783).
    <MotionConfig reducedMotion="user">
    {/* Provider buttons only appear on the auth screens, which mount their own
        AuthProvider. */}
    <AuthProvider discoverOAuthProviders={false}>
      {/* Adopts the ACCOUNT theme at sign-in (and migrates legacy accounts):
          renders nothing, sits here to see both Auth and Theme providers. */}
      <ThemeAccountSync />
      {/* The account's vibration switch, for the mobile app (MIN-959). */}
      <HapticsAccountSync />
      <RememberTimeZone />
      {/* The sending shortcut chosen by the account, placed high: all
 composers of the app are below, and none need to know
 Supabase to read it (see lib/keyboard/use-send-mode). */}
      <SendModeBoundary>
        <AccountQueryProvider>
          {/* Mentions show their hover card in the signed-in app only (MIN-879). */}
          <MentionHoverProvider card={MentionHoverCard}>
          <FirstContentWatch />
          <RealtimeProvider>
            <ProjectsProvider>
              <PromptDeliveryProvider>
              <IssuePanelProvider>
              <PagePanelProvider>
              {/* Reopens the creation wizard when returning from a git redirect
 (?setup=git): the project does not yet exist, the restart cannot therefore live in the layout of a project. */}
              <Suspense fallback={null}>
                <ProjectDraftResume />
              </Suspense>
              {/* Navigation providers also scope keyboard chords and assistant links. */}
              <CurrentViewProvider>
              <AppTabsProvider>
              <AssistantPanelProvider>
                {/* The Numo conversation lives above both projections. Closing
                    the panel or leaving the page dismantles a shell, not the
                    current turn. */}
                <AssistantChatProvider>
                  {/* Draft text, mentions, skills, and uploads outlive either
                      projection of the shared composer. */}
                  <AssistantComposerProvider>
                    <ScratchpadProvider>
                    <SidebarVisibilityProvider>
                      {/* Above the keyboard: ⌘B reads this context to know
 that a page has a secondary sidebar — the primary y
 is in rail, there is nothing more to fold. */}
                      <SecondarySidebarProvider>
                        <KeyboardProvider>
                          <UndoProvider>
                            <CreateProvider>
                              <BulkActionsProvider>
                                <PrUnlinkConfirmationProvider>
                                  <OnboardingProvider>
                                    <AppShellChrome>{children}</AppShellChrome>
                                    {/* A page of its own over the app for a new
                                        account: profile, then the phone tour. */}
                                    <FirstRunGate />
                                    <ResourcePreviewHost />
                                  </OnboardingProvider>
                                </PrUnlinkConfirmationProvider>
                              </BulkActionsProvider>
                              {/* Inside creation: its drafts tray reopens a
                                  draft in the creation dialogs (MIN-753). */}
                              <AssistantFab />
                            </CreateProvider>
                            <DeferredAssistantPanel />
                            <DeferredScratchpadModal />
                            <DeferredKeyboardCheatsheet />
                            {/* ⇧C: an item's comment field (MIN-803). */}
                            <CommentShortcut />
                            <AnalyticsProjectGroup />
                            <PushServiceWorker />
                            {/* The native counterpart in the desktop app (MIN-291):
 the MIN-89 real-time bridge already provides everything,
 there are only the banners to emit. */}
                            <DesktopNotifications />
                            {/* The question of audience measurement, asked once
 times in the desktop app — the site banner
 does not go there (MIN-291). */}
                            <DesktopAnalyticsPrompt />
                            {/* Obligatory suspense: it reads `useSearchParams`,
 because the target of a notification lives in the
 query (`?issue=…`). */}
                            <Suspense fallback={null}>
                              <PushNotificationDismiss />
                            </Suspense>
                          </UndoProvider>
                        </KeyboardProvider>
                      </SecondarySidebarProvider>
                    </SidebarVisibilityProvider>
                    </ScratchpadProvider>
                  </AssistantComposerProvider>
                </AssistantChatProvider>
              </AssistantPanelProvider>
              </AppTabsProvider>
              </CurrentViewProvider>
              </PagePanelProvider>
              </IssuePanelProvider>
              </PromptDeliveryProvider>
            </ProjectsProvider>
          </RealtimeProvider>
          </MentionHoverProvider>
        </AccountQueryProvider>
      </SendModeBoundary>
    </AuthProvider>
    </MotionConfig>
  );
}
