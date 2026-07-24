"use client";

import dynamic from "next/dynamic";
import { AuthProvider } from "@/lib/auth-context";
import { AppQueryProvider } from "@/lib/query-provider";
import { RealtimeProvider } from "@/lib/realtime-provider";
import { ProjectsProvider } from "@/lib/projects-context";
import { CreateProvider } from "@/lib/create-context";
import { AssistantPanelProvider } from "@/lib/assistant-panel-context";
import { ScratchpadProvider } from "@/lib/scratchpad-context";
import { KeyboardProvider } from "@/lib/keyboard/keyboard-context";
import { UndoProvider } from "@/lib/undo/undo-context";
import { BulkActionsProvider } from "@/lib/bulk-actions-context";
import { AppShellChrome } from "@/components/app-shell-chrome";
import { AssistantFab } from "@/components/assistant-fab";
import { KeyboardCheatsheet } from "@/components/keyboard-cheatsheet";
import { AnalyticsProjectGroup } from "@/components/analytics-project-group";

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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppQueryProvider>
        <RealtimeProvider>
          <ProjectsProvider>
            <AssistantPanelProvider>
              <ScratchpadProvider>
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
              </ScratchpadProvider>
            </AssistantPanelProvider>
          </ProjectsProvider>
        </RealtimeProvider>
      </AppQueryProvider>
    </AuthProvider>
  );
}
