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
import { SendModeBoundary } from "@/app/(app)/send-mode-boundary";
import { SecondarySidebarProvider } from "@/lib/secondary-sidebar-context";
import { ZenModeProvider } from "@/lib/zen-mode-context";
import { UndoProvider } from "@/lib/undo/undo-context";
import { BulkActionsProvider } from "@/lib/bulk-actions-context";
import { AppShellChrome } from "@/components/app-shell-chrome";
import { AssistantFab } from "@/components/assistant-fab";
import { KeyboardCheatsheet } from "@/components/keyboard-cheatsheet";
import { AnalyticsProjectGroup } from "@/components/analytics-project-group";
import { NewVersionBanner } from "@/components/new-version-banner";
import { PushServiceWorker } from "@/components/push-service-worker";
import { DesktopNotifications } from "@/components/desktop-notifications";
import { DesktopAnalyticsPrompt } from "@/components/desktop-analytics-prompt";
import { DesktopWindowButtons } from "@/components/desktop-window-buttons";
import { PushNotificationDismiss } from "@/components/push-notification-dismiss";
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
      {/* Le raccourci d'envoi choisi par le compte, posé haut : tous les
          composers de l'app sont dessous, et aucun n'a besoin de connaître
          Supabase pour le lire (cf. lib/keyboard/use-send-mode). */}
      <SendModeBoundary>
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
                      {/* Au-dessus du clavier : ⌘B lit ce contexte pour savoir
                          qu'une page porte une sidebar secondaire — la primaire y
                          est en rail, il n'y a plus rien à replier. */}
                      <SecondarySidebarProvider>
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
                            <NewVersionBanner />
                            <PushServiceWorker />
                            {/* Le pendant natif dans l'app de bureau (MIN-291) :
                                le pont temps réel de MIN-89 fournit déjà tout,
                                il n'y a que les bannières à émettre. */}
                            <DesktopNotifications />
                            {/* La question de la mesure d'audience, posée une
                                fois dans l'app de bureau — le bandeau de site
                                n'y va pas (MIN-291). */}
                            <DesktopAnalyticsPrompt />
                            {/* Les boutons macOS sont natifs : rien ne passe
                                devant eux, donc ils s'effacent le temps d'une
                                boîte de dialogue (MIN-291). */}
                            <DesktopWindowButtons />
                            {/* Suspense obligatoire : il lit `useSearchParams`,
                                parce que la cible d'une notification vit dans la
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
            </ProjectsProvider>
          </RealtimeProvider>
        </AppQueryProvider>
      </SendModeBoundary>
    </AuthProvider>
  );
}
