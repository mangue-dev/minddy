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
import { KeyboardProvider } from "@/lib/keyboard/keyboard-context";
import { ZenModeProvider } from "@/lib/zen-mode-context";
import { UndoProvider } from "@/lib/undo/undo-context";
import { BulkActionsProvider } from "@/lib/bulk-actions-context";
import { AppShellChrome } from "@/components/app-shell-chrome";
import { AssistantFab } from "@/components/assistant-fab";
import { KeyboardCheatsheet } from "@/components/keyboard-cheatsheet";
import { AnalyticsProjectGroup } from "@/components/analytics-project-group";
import { ProjectDraftResume } from "@/components/project-draft-resume";

// Deferred: keeps streamdown/shiki (markdown rendering) out of the initial bundle.
const AssistantPanel = dynamic(
  () => import("@/components/assistant-panel").then((m) => m.AssistantPanel),
  { ssr: false }
);

// Deferred for the same reason (the Notes modal renders markdown).
const ScratchpadModal = dynamic(
  () =>
    import("@/components/scratchpad/scratchpad-modal").then(
      (m) => m.ScratchpadModal
    ),
  { ssr: false }
);

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppQueryProvider>
        <RealtimeProvider>
          <ProjectsProvider>
            {/* Rouvre le wizard de création au retour d'un redirect git
                (?setup=git) : le projet n'existe pas encore, la reprise ne peut
                donc pas vivre dans le layout d'un projet. */}
            <Suspense fallback={null}>
              <ProjectDraftResume />
            </Suspense>
            <AssistantPanelProvider>
              {/* La conversation Numo vit ICI, au-dessus du panneau : fermer le
                  panneau démonte sa coquille, pas le tour en cours. */}
              <AssistantChatProvider>
                <ScratchpadProvider>
                  {/* Le mode zen (MIN-134) enveloppe le shell ET le FAB : c'est
                      le chrome des deux qu'il masque, et ils sont frères. */}
                  <ZenModeProvider>
                    <KeyboardProvider>
                      <UndoProvider>
                        <CreateProvider>
                          <BulkActionsProvider>
                            <AppShellChrome>{children}</AppShellChrome>
                          </BulkActionsProvider>
                        </CreateProvider>
                        <AssistantPanel />
                        <AssistantFab />
                        <ScratchpadModal />
                        <KeyboardCheatsheet />
                        <AnalyticsProjectGroup />
                      </UndoProvider>
                    </KeyboardProvider>
                  </ZenModeProvider>
                </ScratchpadProvider>
              </AssistantChatProvider>
            </AssistantPanelProvider>
          </ProjectsProvider>
        </RealtimeProvider>
      </AppQueryProvider>
    </AuthProvider>
  );
}
