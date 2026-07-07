"use client";

import dynamic from "next/dynamic";
import { AuthProvider } from "@/lib/auth-context";
import { AppQueryProvider } from "@/lib/query-provider";
import { ProjectsProvider } from "@/lib/projects-context";
import { AssistantPanelProvider } from "@/lib/assistant-panel-context";
import { AppShellChrome } from "@/components/app-shell-chrome";
import { AssistantFab } from "@/components/assistant-fab";

// Deferred: keeps streamdown/shiki (markdown rendering) out of the initial bundle.
const AssistantPanel = dynamic(
  () => import("@/components/assistant-panel").then((m) => m.AssistantPanel),
  { ssr: false }
);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppQueryProvider>
        <ProjectsProvider>
          <AssistantPanelProvider>
            <AppShellChrome>{children}</AppShellChrome>
            <AssistantPanel />
            <AssistantFab />
          </AssistantPanelProvider>
        </ProjectsProvider>
      </AppQueryProvider>
    </AuthProvider>
  );
}
