"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { AuthProvider } from "@/lib/auth-context";
import { AppQueryProvider } from "@/lib/query-provider";
import { RealtimeProvider } from "@/lib/realtime-provider";
import { ProjectsProvider } from "@/lib/projects-context";
import { CreateProvider } from "@/lib/create-context";
import { AssistantPanelProvider } from "@/lib/assistant-panel-context";
import { AssistantChatProvider } from "@/lib/assistant-chat-context";
import { ScratchpadProvider } from "@/lib/scratchpad-context";
import {
  KeyboardProvider,
  useCheatsheet,
} from "@/lib/keyboard/keyboard-context";
import { SendModeBoundary } from "@/app/(app)/send-mode-boundary";
import { SecondarySidebarProvider } from "@/lib/secondary-sidebar-context";
import { ZenModeProvider } from "@/lib/zen-mode-context";
import { UndoProvider } from "@/lib/undo/undo-context";
import { BulkActionsProvider } from "@/lib/bulk-actions-context";
import { CurrentViewProvider } from "@/lib/current-view-context";
import { IssuePanelProvider } from "@/lib/issue-panel-context";
import { AppShellChrome } from "@/components/app-shell-chrome";
import { AssistantFab } from "@/components/assistant-fab";
import { AnalyticsProjectGroup } from "@/components/analytics-project-group";
import { NewVersionBanner } from "@/components/new-version-banner";
import { PushServiceWorker } from "@/components/push-service-worker";
import { DesktopNotifications } from "@/components/desktop-notifications";
import { DesktopAnalyticsPrompt } from "@/components/desktop-analytics-prompt";
import { DesktopWindowButtons } from "@/components/desktop-window-buttons";
import { PushNotificationDismiss } from "@/components/push-notification-dismiss";
import { ProjectDraftResume } from "@/components/project-draft-resume";
import { ThemeAccountSync } from "@/components/theme-account-sync";
import { loadScratchpadModal } from "@/lib/lazy-app-surfaces";

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

function DeferredKeyboardCheatsheet() {
  const { open } = useCheatsheet();
  return open ? <KeyboardCheatsheet /> : null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {/* Adopts the ACCOUNT theme at sign-in (and migrates legacy accounts):
          renders nothing, sits here to see both Auth and Theme providers. */}
      <ThemeAccountSync />
      {/* The sending shortcut chosen by the account, placed high: all
 composers of the app are below, and none need to know
 Supabase to read it (see lib/keyboard/use-send-mode). */}
      <SendModeBoundary>
        <AppQueryProvider>
          <RealtimeProvider>
            <ProjectsProvider>
              <IssuePanelProvider>
              {/* Reopens the creation wizard when returning from a git redirect
 (?setup=git): the project does not yet exist, the restart cannot therefore live in the layout of a project. */}
              <Suspense fallback={null}>
                <ProjectDraftResume />
              </Suspense>
              <AssistantPanelProvider>
                {/* The Numo conversation lives HERE, above the sign: close the
 panel dismantles its shell, not the current round. */}
                <AssistantChatProvider>
                  <ScratchpadProvider>
                    {/* Zen mode (MIN-134) wraps the shell AND the FAB: it is
 the chrome of the two it hides, and they are brothers. */}
                    <ZenModeProvider>
                      {/* Above the keyboard: ⌘B reads this context to know
 that a page has a secondary sidebar — the primary y
 is in rail, there is nothing more to fold. */}
                      <SecondarySidebarProvider>
                        <KeyboardProvider>
                          <UndoProvider>
                            <CreateProvider>
                              <BulkActionsProvider>
                                {/* “Save current view” (⌘K) starts from
 address; surfaces whose selection
 does not live there (a conversation of /agents, the open
 PR, the active view of a board) the
 publish here. Above the shell, therefore:
 it is the palette which reads. */}
                                <CurrentViewProvider>
                                  <AppShellChrome>{children}</AppShellChrome>
                                </CurrentViewProvider>
                              </BulkActionsProvider>
                            </CreateProvider>
                            <AssistantPanel />
                            <AssistantFab />
                            <ScratchpadModal />
                            <DeferredKeyboardCheatsheet />
                            <AnalyticsProjectGroup />
                            <NewVersionBanner />
                            <PushServiceWorker />
                            {/* The native counterpart in the desktop app (MIN-291):
 the MIN-89 real-time bridge already provides everything,
 there are only the banners to emit. */}
                            <DesktopNotifications />
                            {/* The question of audience measurement, asked once
 times in the desktop app — the site banner
 does not go there (MIN-291). */}
                            <DesktopAnalyticsPrompt />
                            {/* The macOS buttons are native: nothing happens
 in front of them, so they are erased for the duration of a
 dialog box (MIN-291). */}
                            <DesktopWindowButtons />
                            {/* Obligatory suspense: it reads `useSearchParams`,
 because the target of a notification lives in the
 query (`?issue=…`). */}
                            <Suspense fallback={null}>
                              <PushNotificationDismiss />
                            </Suspense>
                          </UndoProvider>
                        </KeyboardProvider>
                      </SecondarySidebarProvider>
                    </ZenModeProvider>
                  </ScratchpadProvider>
                </AssistantChatProvider>
              </AssistantPanelProvider>
              </IssuePanelProvider>
            </ProjectsProvider>
          </RealtimeProvider>
        </AppQueryProvider>
      </SendModeBoundary>
    </AuthProvider>
  );
}
